import { Controller, Get, Module } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHubFake, RESELLER_PROFILE } from '../testing/hub-fake.js';
import { createTestApp, TEST_API_KEY, testConfig, type TestApp } from '../testing/test-app.js';
import { EchoCallModule } from './echocall.module.js';
import { HubClientFactory } from './hub-client.factory.js';
import { HubException } from './hub.exception.js';

describe('HubClientFactory', () => {
  it('sends the bearer key and, for a customer client, the act-as header', async () => {
    const hub = createHubFake({
      'GET /agents': { body: { data: [] } },
      'GET /users/me': { body: RESELLER_PROFILE },
    });
    const factory = new HubClientFactory(testConfig(), hub.fetch);

    const me = await factory.call(() => factory.forAdmin().GET('/users/me'));
    expect(me.role).toBe('reseller');
    expect(hub.calls[0].headers.get('authorization')).toBe(`Bearer ${TEST_API_KEY}`);
    expect(hub.calls[0].headers.get('x-echocall-customer')).toBeNull();

    await factory.call(() => factory.forCustomer(501).GET('/agents'));
    expect(hub.calls[1].path).toBe('/agents');
    expect(hub.calls[1].headers.get('x-echocall-customer')).toBe('501');
  });

  it('rethrows a hub error envelope with the same status and code', async () => {
    const hub = createHubFake({
      'GET /users/me': {
        status: 403,
        body: {
          error: { code: 'no_active_subscription', message: 'Subscribe first', details: { plan: null } },
        },
      },
    });
    const factory = new HubClientFactory(testConfig(), hub.fetch);
    const error = await factory.call(() => factory.forAdmin().GET('/users/me')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HubException);
    const hubError = error as HubException;
    expect(hubError.getStatus()).toBe(403);
    expect(hubError.envelope).toEqual({
      error: { code: 'no_active_subscription', message: 'Subscribe first', details: { plan: null } },
    });
  });

  it('turns a hub 401 into 503 so the browser does not treat it as an expired session', async () => {
    const hub = createHubFake({
      'GET /users/me': {
        status: 401,
        body: { error: { code: 'invalid_api_key', message: 'Invalid API key' } },
      },
    });
    const factory = new HubClientFactory(testConfig(), hub.fetch);
    const error = (await factory
      .call(() => factory.forAdmin().GET('/users/me'))
      .catch((e: unknown) => e)) as HubException;
    expect(error.getStatus()).toBe(503);
    expect(error.code).toBe('invalid_api_key');
  });

  it('maps a non-envelope upstream body to 502 upstream_error', async () => {
    const fetch: typeof globalThis.fetch = async () =>
      new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } });
    const factory = new HubClientFactory(testConfig(), fetch);
    const error = (await factory
      .call(() => factory.forAdmin().GET('/users/me'))
      .catch((e: unknown) => e)) as HubException;
    expect(error.getStatus()).toBe(502);
    expect(error.envelope.error.code).toBe('upstream_error');
    expect(error.envelope.error.message).not.toContain('html');
  });

  it('maps network failures to 502 upstream_unavailable and timeouts to 504 upstream_timeout', async () => {
    const down = createHubFake({
      'GET /users/me': () => {
        throw new TypeError('fetch failed');
      },
    });
    const downFactory = new HubClientFactory(testConfig(), down.fetch);
    const downError = (await downFactory
      .call(() => downFactory.forAdmin().GET('/users/me'))
      .catch((e: unknown) => e)) as HubException;
    expect(downError.getStatus()).toBe(502);
    expect(downError.code).toBe('upstream_unavailable');

    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    const slowFactory = new HubClientFactory(testConfig(), async () => Promise.reject(timeout));
    const slowError = (await slowFactory
      .call(() => slowFactory.forAdmin().GET('/users/me'))
      .catch((e: unknown) => e)) as HubException;
    expect(slowError.getStatus()).toBe(504);
    expect(slowError.code).toBe('upstream_timeout');
  });

  it('gives every hub request a deadline unless one was passed', async () => {
    let seen: AbortSignal | null | undefined;
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      seen = init?.signal;
      return new Response(JSON.stringify(RESELLER_PROFILE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const factory = new HubClientFactory(testConfig(), fetch);
    await factory.call(() => factory.forAdmin().GET('/users/me'));
    expect(seen).toBeInstanceOf(AbortSignal);
  });
});

@Controller('probe')
class ProbeController {
  constructor(private readonly hub: HubClientFactory) {}

  @Get('me')
  me() {
    return this.hub.call(() => this.hub.forAdmin().GET('/users/me'));
  }
}

@Module({ imports: [EchoCallModule], controllers: [ProbeController] })
class ProbeModule {}

describe('HubException through the HTTP layer', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([ProbeModule]);
  });

  afterAll(async () => {
    await t.close();
  });

  it('answers with the hub status and envelope unchanged', async () => {
    t.hub.on('GET /users/me', {
      status: 403,
      body: { error: { code: 'no_active_subscription', message: 'Subscribe first' } },
    });
    const res = await request(t.app.getHttpServer()).get('/api/probe/me');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'no_active_subscription', message: 'Subscribe first' } });
  });

  it('returns the hub data for a successful call', async () => {
    t.hub.on('GET /users/me', { body: RESELLER_PROFILE });
    const res = await request(t.app.getHttpServer()).get('/api/probe/me');
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('operator@example.com');
  });
});
