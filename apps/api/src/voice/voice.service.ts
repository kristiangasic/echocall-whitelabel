import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { apiError } from '../common/http-error.js';
import { HubClientFactory } from '../echocall/hub-client.factory.js';
import type { SessionUser } from '../auth/session.service.js';
import { issueVoiceTicket, VOICE_TICKET_TTL_MS, voiceStreamPath } from './voice-relay.js';

/** An id as the service writes them: no slashes, nothing that climbs a path. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A language code, as in "de" or "pt-br". */
const LANGUAGE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

/** A spoken sample of one voice. */
export interface VoiceSample {
  audio: Buffer;
  contentType: string;
  /** The language actually spoken, which may differ from the one asked for. */
  language: string;
}

/** What the browser needs to run a test call. */
export interface TestCall {
  /** Path on this portal, ticket included. Open it as a websocket. */
  streamPath: string;
  /** How long the call may run. */
  maxSeconds: number;
  /** How long the path stays open for the first connection. */
  expiresInSeconds: number;
  agent: { id: string; name: string; firstMessage: string | null; language: string | null };
}

/** What the service answers when a test call is claimed. */
interface ServiceCall {
  streamPath?: unknown;
  maxSeconds?: unknown;
  agent?: { id?: unknown; name?: unknown; firstMessage?: unknown; language?: unknown };
}

/** A field of the answer as text, or the fallback when it is anything else. */
function textOf(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

/**
 * Hearing a voice, and calling an agent.
 *
 * Both reach the service through the portal rather than from the browser: the
 * sample so that the address of whoever synthesizes it never appears in a
 * page, the call so that its audio runs over this portal's own domain.
 */
@Injectable()
export class VoiceService {
  constructor(
    private readonly hub: HubClientFactory,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Speaks one sentence with the given voice, in the given language. */
  async sample(user: SessionUser, voiceId: string, language: string | undefined): Promise<VoiceSample> {
    const customerId = this.customerOf(user);
    if (!ID.test(voiceId)) throw apiError(400, 'invalid_id', 'That is not a voice');
    if (language !== undefined && !LANGUAGE.test(language))
      throw apiError(400, 'invalid_language', 'That is not a language code');
    const query = new URLSearchParams(language === undefined ? {} : { language });
    const result = await this.hub.raw('GET', `/voices/${voiceId}/preview`, {
      customerId,
      query,
      accept: 'binary',
    });
    if (!result.contentType?.startsWith('audio/'))
      throw apiError(502, 'preview_unavailable', 'The voice sample is not available right now');
    return {
      audio: result.body as Buffer,
      contentType: result.contentType,
      language: result.headers.get('content-language') ?? language ?? 'en',
    };
  }

  /**
   * Claims a test call with one of the customer's agents and parks the
   * service's stream under a ticket of this portal's own.
   */
  async testCall(user: SessionUser, agentId: string): Promise<TestCall> {
    const customerId = this.customerOf(user);
    if (!ID.test(agentId)) throw apiError(400, 'invalid_id', 'That is not an agent');
    const result = await this.hub.raw('POST', `/agents/${agentId}/preview`, { customerId, body: {} });
    const call = (result.body ?? {}) as ServiceCall;
    const streamPath = typeof call.streamPath === 'string' ? call.streamPath : null;
    const maxSeconds = typeof call.maxSeconds === 'number' ? call.maxSeconds : 0;
    if (streamPath === null || maxSeconds <= 0)
      throw apiError(502, 'call_unavailable', 'The test call could not be started');
    const ticket = issueVoiceTicket({
      serviceUrl: this.streamUrl(streamPath),
      label: `agent ${agentId}`,
      maxSeconds,
    });
    return {
      streamPath: voiceStreamPath(ticket),
      maxSeconds,
      expiresInSeconds: Math.round(VOICE_TICKET_TTL_MS / 1000),
      agent: {
        id: textOf(call.agent?.id, agentId),
        name: textOf(call.agent?.name, ''),
        firstMessage: typeof call.agent?.firstMessage === 'string' ? call.agent.firstMessage : null,
        language: typeof call.agent?.language === 'string' ? call.agent.language : null,
      },
    };
  }

  /** The service's stream path, made absolute and turned into a websocket address. */
  private streamUrl(streamPath: string): string {
    const url = new URL(streamPath, this.config.echocall.apiUrl);
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
    return url.toString();
  }

  private customerOf(user: SessionUser): number {
    if (user.echocallCustomerId === null)
      throw apiError(409, 'customer_not_linked', 'This account is not linked to a customer yet');
    return user.echocallCustomerId;
  }
}
