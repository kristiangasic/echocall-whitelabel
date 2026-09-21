/**
 * The test call's relay: the browser talks to this portal, this portal talks
 * to the service.
 *
 * The service already hands out a path of its own rather than the address of
 * whoever synthesizes the voice, and the frames on it are in a neutral format.
 * That address still names the service, and a browser opening it would print
 * the name in its network panel and be stopped by this portal's own content
 * policy, which allows connections to this origin and nowhere else. So the
 * call is claimed on the server, the service's address is parked here under a
 * one-time ticket, and the browser opens a path on this portal instead.
 *
 * Nothing in a frame is read or changed on the way through: whatever the
 * service sends the browser receives, and the other way round.
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import WebSocket, { WebSocketServer, type RawData } from 'ws';

/** The path a browser opens. Wired to the http server in main.ts. */
export const VOICE_STREAM_PATH = '/ws/voice-preview';

/** How long a ticket waits for the browser to connect. */
export const VOICE_TICKET_TTL_MS = 60_000;

/** Seconds beyond the call's own limit before this relay closes it anyway. */
const RELAY_GRACE_SECONDS = 15;

const logger = new Logger('VoiceRelay');

interface Ticket {
  /** Where the service answers. Never leaves this process. */
  serviceUrl: string;
  /** Names the call in the log, never shown to anyone. */
  label: string;
  maxSeconds: number;
  expiresAt: number;
}

const tickets = new Map<string, Ticket>();

/** Parks the service address and returns the one-time ticket the browser gets. */
export function issueVoiceTicket(input: Omit<Ticket, 'expiresAt'>, now: number = Date.now()): string {
  tickets.forEach((ticket, token) => {
    if (ticket.expiresAt <= now) tickets.delete(token);
  });
  const token = randomBytes(24).toString('base64url');
  tickets.set(token, { ...input, expiresAt: now + VOICE_TICKET_TTL_MS });
  return token;
}

/** Takes a ticket out of the store. Null when unknown, used, or expired. */
export function redeemVoiceTicket(token: string, now: number = Date.now()): Ticket | null {
  const ticket = tickets.get(token);
  if (!ticket) return null;
  tickets.delete(token);
  return ticket.expiresAt > now ? ticket : null;
}

/** The path the browser opens for a ticket. */
export function voiceStreamPath(token: string): string {
  return `${VOICE_STREAM_PATH}?t=${encodeURIComponent(token)}`;
}

/** Tests only. */
export function resetVoiceTickets(): void {
  tickets.clear();
}

// noServer: the http server decides which paths are ours (main.ts).
// Compression off: the frames carry base64 audio, which does not compress,
// and every millisecond of delay is audible.
const sockets = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 256 * 1024 });

function closeQuietly(socket: WebSocket | undefined): void {
  if (!socket) return;
  try {
    if (socket.readyState === WebSocket.OPEN) socket.close(1000);
    else if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
  } catch {
    // Already gone.
  }
}

/**
 * Handles the http upgrade for VOICE_STREAM_PATH. Without a valid ticket the
 * socket is answered with a plain 403 and closed before any websocket exists,
 * which is what a reused address gets as well.
 */
export function handleVoiceUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const url = new URL(req.url ?? '', 'http://internal');
  if (url.pathname !== VOICE_STREAM_PATH) return;
  const ticket = redeemVoiceTicket(url.searchParams.get('t') ?? '');
  if (ticket === null) {
    logger.warn('Refused a stream without a valid ticket');
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(req, socket, head, (browser) => relayCall(browser, ticket));
}

/**
 * Runs one call: opens the service side, passes frames through in both
 * directions, and takes everything down together when either end is done or
 * the time is up.
 */
function relayCall(browser: WebSocket, ticket: Ticket): void {
  const startedAt = Date.now();
  let finished = false;
  let service: WebSocket;

  const finish = (reason: string): void => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    closeQuietly(browser);
    closeQuietly(service);
    logger.log(`${ticket.label} over after ${Math.round((Date.now() - startedAt) / 1000)} s (${reason})`);
  };

  const timer = setTimeout(() => finish('timeout'), (ticket.maxSeconds + RELAY_GRACE_SECONDS) * 1000);

  try {
    service = new WebSocket(ticket.serviceUrl, { perMessageDeflate: false });
  } catch (error) {
    logger.error(`${ticket.label} could not reach the service: ${describe(error)}`);
    browser.send(JSON.stringify({ type: 'end', reason: 'error' }));
    closeQuietly(browser);
    clearTimeout(timer);
    return;
  }

  // What the browser says before the service is listening would be lost, and
  // in a call that is the first thing the caller says.
  const pending: RawData[] = [];
  let open = false;

  service.on('open', () => {
    open = true;
    for (const frame of pending) service.send(frame as Buffer);
    pending.length = 0;
  });
  service.on('message', (frame: RawData, isBinary: boolean) => {
    if (!finished && browser.readyState === WebSocket.OPEN)
      browser.send(frame as Buffer, { binary: isBinary });
  });
  service.on('close', () => finish('service'));
  service.on('error', (error) => {
    logger.warn(`${ticket.label} lost the service side: ${describe(error)}`);
    finish('error');
  });

  browser.on('message', (frame: RawData, isBinary: boolean) => {
    if (finished) return;
    if (!open) pending.push(frame);
    else if (service.readyState === WebSocket.OPEN) service.send(frame as Buffer, { binary: isBinary });
  });
  browser.on('close', () => finish('hangup'));
  browser.on('error', () => finish('hangup'));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
