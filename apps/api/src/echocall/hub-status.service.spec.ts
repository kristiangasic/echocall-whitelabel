import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHubFake, type HubFakeRoute, RESELLER_PROFILE } from '../testing/hub-fake.js';
import { testConfig } from '../testing/test-app.js';
import { HubClientFactory } from './hub-client.factory.js';
import { HUB_STATUS_INTERVAL_MS, HubStatusService } from './hub-status.service.js';

function serviceWith(route: HubFakeRoute) {
  const hub = createHubFake({ 'GET /users/me': route });
  return { hub, service: new HubStatusService(new HubClientFactory(testConfig(), hub.fetch)) };
}

describe('HubStatusService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports not_checked before the first refresh', () => {
    const { service } = serviceWith({ body: RESELLER_PROFILE });
    expect(service.current()).toMatchObject({ ok: false, checkedAt: '', error: { code: 'not_checked' } });
  });

  it('is ok for a reseller key and remembers who the key belongs to', async () => {
    const { service } = serviceWith({ body: RESELLER_PROFILE });
    const status = await service.refresh();
    expect(status).toMatchObject({ ok: true, role: 'reseller', email: 'operator@example.com' });
    expect(status.error).toBeUndefined();
    expect(Date.parse(status.checkedAt)).toBeGreaterThan(Date.now() - 5_000);
    expect(service.current()).toBe(status);
  });

  it('rejects keys of plain users and of reseller roles without a reseller record', async () => {
    const user = serviceWith({ body: { ...RESELLER_PROFILE, role: 'user', ownResellerId: null } });
    expect(await user.service.refresh()).toMatchObject({
      ok: false,
      role: 'user',
      error: { code: 'key_not_reseller' },
    });

    const halfway = serviceWith({ body: { ...RESELLER_PROFILE, ownResellerId: null } });
    expect(await halfway.service.refresh()).toMatchObject({ ok: false, error: { code: 'key_not_reseller' } });
  });

  it('passes the hub error code through, for example when the subscription lapsed or the key is invalid', async () => {
    const lapsed = serviceWith({
      status: 403,
      body: { error: { code: 'no_active_subscription', message: 'Subscribe first' } },
    });
    expect(await lapsed.service.refresh()).toEqual({
      ok: false,
      checkedAt: expect.any(String),
      error: { code: 'no_active_subscription', message: 'Subscribe first' },
    });

    const invalid = serviceWith({
      status: 401,
      body: { error: { code: 'invalid_api_key', message: 'Invalid API key' } },
    });
    expect((await invalid.service.refresh()).error?.code).toBe('invalid_api_key');
  });

  it('reports upstream_unavailable when the hub cannot be reached', async () => {
    const { service } = serviceWith(() => {
      throw new TypeError('fetch failed');
    });
    expect(await service.refresh()).toMatchObject({ ok: false, error: { code: 'upstream_unavailable' } });
  });

  it('checks on start, every ten minutes, and stops when the module is destroyed', async () => {
    vi.useFakeTimers();
    const { hub, service } = serviceWith({ body: RESELLER_PROFILE });
    await service.onModuleInit();
    expect(hub.calls).toHaveLength(1);
    expect(service.current().ok).toBe(true);

    hub.on('GET /users/me', {
      status: 403,
      body: { error: { code: 'no_active_subscription', message: 'x' } },
    });
    await vi.advanceTimersByTimeAsync(HUB_STATUS_INTERVAL_MS);
    expect(hub.calls).toHaveLength(2);
    expect(service.current()).toMatchObject({ ok: false, error: { code: 'no_active_subscription' } });

    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(HUB_STATUS_INTERVAL_MS * 2);
    expect(hub.calls).toHaveLength(2);
  });
});
