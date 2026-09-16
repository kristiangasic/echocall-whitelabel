import createClient, { type Client, type Middleware } from 'openapi-fetch';
import type { paths } from './schema';

/** Header a reseller key sends to run a request on behalf of one of its customers. */
export const ACT_AS_CUSTOMER_HEADER = 'X-EchoCall-Customer';

export interface EchoCallClientOptions {
  /** Base URL of the public API, for example https://hub.echocall.de/api/v1 */
  baseUrl: string;
  apiKey: string;
  /** When set, every request runs on behalf of this customer of the reseller. */
  customerId?: number;
  /** Replacement for the global fetch, mainly for tests. */
  fetch?: typeof globalThis.fetch;
}

export type EchoCallClient = Client<paths>;

export function createEchoCallClient(options: EchoCallClientOptions): EchoCallClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl.replace(/\/+$/, ''),
    fetch: options.fetch,
    headers: { accept: 'application/json' },
  });
  const auth: Middleware = {
    onRequest({ request }) {
      request.headers.set('authorization', `Bearer ${options.apiKey}`);
      if (options.customerId != null) {
        request.headers.set(ACT_AS_CUSTOMER_HEADER, String(options.customerId));
      }
      return request;
    },
  };
  client.use(auth);
  return client;
}
