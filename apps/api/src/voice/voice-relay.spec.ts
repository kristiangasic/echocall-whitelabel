import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  handleVoiceUpgrade,
  issueVoiceTicket,
  redeemVoiceTicket,
  resetVoiceTickets,
  VOICE_STREAM_PATH,
  VOICE_TICKET_TTL_MS,
  voiceStreamPath,
} from './voice-relay.js';

const SERVICE_URL = 'wss://service.example/ws/agent-preview?t=secret';

describe('tickets', () => {
  beforeEach(() => resetVoiceTickets());

  it('hands a ticket out exactly once', () => {
    const token = issueVoiceTicket({ serviceUrl: SERVICE_URL, label: 'agent 7', maxSeconds: 300 }, 1_000);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(voiceStreamPath(token)).toBe(`${VOICE_STREAM_PATH}?t=${token}`);
    expect(redeemVoiceTicket(token, 2_000)?.serviceUrl).toBe(SERVICE_URL);
    expect(redeemVoiceTicket(token, 2_000)).toBeNull();
  });

  it('refuses an unknown, forged or expired ticket', () => {
    expect(redeemVoiceTicket('')).toBeNull();
    expect(redeemVoiceTicket('forged')).toBeNull();
    const token = issueVoiceTicket({ serviceUrl: SERVICE_URL, label: 'agent 7', maxSeconds: 300 }, 1_000);
    expect(redeemVoiceTicket(token, 1_000 + VOICE_TICKET_TTL_MS)).toBeNull();
  });

  it('never repeats a ticket', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(issueVoiceTicket({ serviceUrl: SERVICE_URL, label: 'agent 7', maxSeconds: 300 }));
    }
    expect(seen.size).toBe(200);
  });

  it('keeps the service address out of what the browser is given', () => {
    const token = issueVoiceTicket({ serviceUrl: SERVICE_URL, label: 'agent 7', maxSeconds: 300 });
    expect(voiceStreamPath(token)).not.toContain('service.example');
    expect(voiceStreamPath(token)).not.toContain('secret');
  });
});

describe('relaying a call', () => {
  let portal: Server;
  let service: WebSocketServer;
  let portalPort = 0;
  let serviceUrl = '';
  /** What the fake service received, in order. */
  let heard: string[] = [];

  beforeAll(async () => {
    service = new WebSocketServer({ port: 0 });
    await once(service, 'listening');
    serviceUrl = `ws://127.0.0.1:${(service.address() as AddressInfo).port}/ws/agent-preview?t=secret`;
    service.on('connection', (socket) => {
      socket.on('message', (data: Buffer) => {
        heard.push(data.toString('utf8'));
        if (data.toString('utf8') === '{"type":"end"}') socket.close();
        else socket.send('{"type":"agent","text":"Guten Tag"}');
      });
      socket.send('{"type":"ready","maxSeconds":300}');
    });

    portal = createServer();
    portal.on('upgrade', handleVoiceUpgrade);
    portal.listen(0);
    await once(portal, 'listening');
    portalPort = (portal.address() as AddressInfo).port;
  });

  afterAll(async () => {
    service.close();
    portal.close();
    await once(portal, 'close');
  });

  beforeEach(() => {
    heard = [];
    resetVoiceTickets();
  });

  const open = (path: string): WebSocket => new WebSocket(`ws://127.0.0.1:${portalPort}${path}`);

  it('passes frames through in both directions', async () => {
    const token = issueVoiceTicket({ serviceUrl, label: 'agent 7', maxSeconds: 300 });
    const browser = open(voiceStreamPath(token));
    const frames: string[] = [];
    browser.on('message', (data: Buffer) => frames.push(data.toString('utf8')));
    await once(browser, 'open');
    // Sent straight away: the service side may still be connecting, and in a
    // call the first thing the caller says must not be dropped.
    browser.send('{"type":"audio","chunk":"AAAA"}');
    await new Promise((resolve) => setTimeout(resolve, 200));
    browser.close();

    expect(heard).toContain('{"type":"audio","chunk":"AAAA"}');
    expect(frames).toContain('{"type":"ready","maxSeconds":300}');
    expect(frames).toContain('{"type":"agent","text":"Guten Tag"}');
  });

  it('refuses a stream whose ticket is missing, forged or already used', async () => {
    const token = issueVoiceTicket({ serviceUrl, label: 'agent 7', maxSeconds: 300 });
    const first = open(voiceStreamPath(token));
    await once(first, 'open');
    first.close();

    for (const path of [VOICE_STREAM_PATH, `${VOICE_STREAM_PATH}?t=forged`, voiceStreamPath(token)]) {
      const refused = open(path);
      const [error] = (await once(refused, 'error')) as [Error];
      expect(error.message).toContain('403');
    }
  });
});
