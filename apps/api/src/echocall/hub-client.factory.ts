import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createEchoCallClient, type EchoCallClient, isHubErrorBody } from '@echocall/light-api-client';
import { type AppConfig, APP_CONFIG } from '../config/env.js';
import { describeError } from '../common/http-error.js';
import { HubException } from './hub.exception.js';

/** Injection token for the fetch implementation used to reach the hub (tests hand in a fake). */
export const HUB_FETCH = Symbol('HUB_FETCH');

/** Upper bound for one hub round trip; the hub answers list calls well below this. */
export const HUB_TIMEOUT_MS = 20_000;

export type HubFetch = typeof globalThis.fetch;

/** The part of an openapi-fetch result the factory needs to turn it into data or an error. */
export interface HubCallResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

@Injectable()
export class HubClientFactory {
  private readonly logger = new Logger(HubClientFactory.name);
  private readonly fetchImpl: HubFetch;
  private readonly admin: EchoCallClient;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(HUB_FETCH) fetchImpl?: HubFetch,
  ) {
    this.fetchImpl = withTimeout(fetchImpl ?? globalThis.fetch);
    this.admin = this.create();
  }

  /** Client that acts as the portal operator (the reseller behind the API key). */
  forAdmin(): EchoCallClient {
    return this.admin;
  }

  /** Client that runs every request on behalf of one customer of the reseller. */
  forCustomer(customerId: number): EchoCallClient {
    return this.create(customerId);
  }

  /**
   * Runs one client call and returns its data.
   * A hub error envelope is rethrown unchanged (same status, same code) except
   * that a hub 401 becomes 503: the portal's key is broken, not the user's session.
   * Network failures become 502 upstream_unavailable, timeouts 504 upstream_timeout.
   */
  async call<T>(fn: () => Promise<HubCallResult<T>>): Promise<T> {
    let result: HubCallResult<T>;
    try {
      result = await fn();
    } catch (error) {
      throw this.transportError(error);
    }
    if (result.error !== undefined) {
      throw this.hubError(result.response.status, result.error);
    }
    return result.data as T;
  }

  private create(customerId?: number): EchoCallClient {
    return createEchoCallClient({
      baseUrl: this.config.echocall.apiUrl,
      apiKey: this.config.echocall.apiKey,
      customerId,
      fetch: this.fetchImpl,
    });
  }

  private hubError(status: number, body: unknown): HubException {
    if (isHubErrorBody(body)) {
      const envelope = { error: { code: body.error.code, message: body.error.message, ...detailsOf(body) } };
      if (status === 401) {
        this.logger.error(`The hub rejected the configured API key: ${body.error.code}`);
        return new HubException(503, envelope);
      }
      return new HubException(status, envelope);
    }
    this.logger.error(`Unexpected hub response (${status}): ${describeError(body).slice(0, 300)}`);
    return new HubException(502, {
      error: { code: 'upstream_error', message: `Unexpected response from the service (${status})` },
    });
  }

  private transportError(error: unknown): HubException {
    if (error instanceof HubException) return error;
    this.logger.error(`Hub request failed: ${describeError(error)}`);
    if (isTimeout(error)) {
      return new HubException(504, {
        error: {
          code: 'upstream_timeout',
          message: 'The service did not answer in time. Try again shortly.',
        },
      });
    }
    return new HubException(502, {
      error: {
        code: 'upstream_unavailable',
        message: 'The service is temporarily unavailable. Try again shortly.',
      },
    });
  }
}

function detailsOf(body: { error: { details?: unknown } }): { details?: unknown } {
  return body.error.details === undefined ? {} : { details: body.error.details };
}

function isTimeout(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'TimeoutError';
}

/** Gives every hub request a deadline unless the caller already passed a signal. */
function withTimeout(base: HubFetch): HubFetch {
  return (input, init) =>
    base(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(HUB_TIMEOUT_MS) });
}
