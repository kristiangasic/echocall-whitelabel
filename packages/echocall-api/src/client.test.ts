import { describe, it, expect, vi } from 'vitest';
import { ACT_AS_CUSTOMER_HEADER, createEchoCallClient } from './client';

const KEY = 'eck_live_' + 'a'.repeat(64);

function fakeFetch(status = 200, body: unknown = { ok: true }) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

function sentRequest(fetch: ReturnType<typeof fakeFetch>): Request {
  const [input, init] = fetch.mock.calls[0];
  return input instanceof Request ? input : new Request(input, init);
}

describe('createEchoCallClient', () => {
  it('sends the bearer key and no customer header by default', async () => {
    const fetch = fakeFetch();
    const client = createEchoCallClient({ baseUrl: 'https://hub.example/api/v1/', apiKey: KEY, fetch });
    await client.GET('/users/me');
    const req = sentRequest(fetch);
    expect(req.url).toBe('https://hub.example/api/v1/users/me');
    expect(req.headers.get('authorization')).toBe(`Bearer ${KEY}`);
    expect(req.headers.get(ACT_AS_CUSTOMER_HEADER)).toBeNull();
    expect(req.headers.get('accept')).toBe('application/json');
  });

  it('adds the customer header when a customer id is given', async () => {
    const fetch = fakeFetch();
    const client = createEchoCallClient({
      baseUrl: 'https://hub.example/api/v1',
      apiKey: KEY,
      customerId: 501,
      fetch,
    });
    await client.GET('/agents');
    expect(sentRequest(fetch).headers.get(ACT_AS_CUSTOMER_HEADER)).toBe('501');
  });

  it('hands the hub error envelope back and never leaks the key into it', async () => {
    const fetch = fakeFetch(403, { error: { code: 'no_active_subscription', message: 'nope' } });
    const client = createEchoCallClient({ baseUrl: 'https://hub.example/api/v1', apiKey: KEY, fetch });
    const { error, response } = await client.GET('/users/me');
    expect(response.status).toBe(403);
    expect(error).toEqual({ error: { code: 'no_active_subscription', message: 'nope' } });
    expect(JSON.stringify(error)).not.toContain('a'.repeat(64));
  });
});
