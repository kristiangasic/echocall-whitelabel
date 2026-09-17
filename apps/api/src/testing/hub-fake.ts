import type { HubFetch } from '../echocall/hub-client.factory.js';

/** One request the fake hub received, with the path relative to the API base. */
export interface HubFakeCall {
  method: string;
  path: string;
  headers: Headers;
  body: string | null;
}

export interface HubFakeReply {
  status?: number;
  body?: unknown;
  /** When set, answers with these bytes and contentType instead of JSON. */
  binary?: Uint8Array;
  contentType?: string;
  /** Extra response headers, for example a Content-Disposition on a download. */
  headers?: Record<string, string>;
}

export type HubFakeRoute = HubFakeReply | ((call: HubFakeCall) => HubFakeReply | Promise<HubFakeReply>);

export interface HubFake {
  fetch: HubFetch;
  calls: HubFakeCall[];
  /** Routes keyed as "GET /users/me"; a route that throws simulates a network failure. */
  routes: Map<string, HubFakeRoute>;
  /** Replaces or adds one route. */
  on(key: string, route: HubFakeRoute): HubFake;
}

/** Profile the hub answers for a valid reseller key. */
export const RESELLER_PROFILE = {
  id: 77,
  email: 'operator@example.com',
  name: 'Portal Operator',
  role: 'reseller',
  avatarUrl: null,
  defaultLanguage: 'de',
  resellerId: null,
  ownResellerId: 9,
};

/** Builds a fetch replacement that answers like the hub, without a network. */
export function createHubFake(routes: Record<string, HubFakeRoute> = {}): HubFake {
  const calls: HubFakeCall[] = [];
  const table = new Map<string, HubFakeRoute>(Object.entries(routes));
  const fetch: HubFetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname.replace(/^.*\/api\/v1/, '') + url.search;
    const call: HubFakeCall = {
      method: request.method,
      path,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? null : await request.text(),
    };
    calls.push(call);
    const route = table.get(`${request.method} ${url.pathname.replace(/^.*\/api\/v1/, '')}`);
    const reply: HubFakeReply = route
      ? typeof route === 'function'
        ? await route(call)
        : route
      : {
          status: 404,
          body: { error: { code: 'not_found', message: `No fake route for ${request.method} ${path}` } },
        };
    const status = reply.status ?? 200;
    if (status === 204) return new Response(null, { status });
    if (reply.binary)
      return new Response(Buffer.from(reply.binary), {
        status,
        headers: { 'content-type': reply.contentType ?? 'application/octet-stream', ...reply.headers },
      });
    return new Response(JSON.stringify(reply.body ?? {}), {
      status,
      headers: { 'content-type': reply.contentType ?? 'application/json', ...reply.headers },
    });
  };
  const fake: HubFake = {
    fetch,
    calls,
    routes: table,
    on(key, route) {
      table.set(key, route);
      return fake;
    },
  };
  return fake;
}

/** A fake hub that recognises the test key as a reseller. */
export function createResellerHubFake(routes: Record<string, HubFakeRoute> = {}): HubFake {
  return createHubFake({ 'GET /users/me': { body: RESELLER_PROFILE }, ...routes });
}
