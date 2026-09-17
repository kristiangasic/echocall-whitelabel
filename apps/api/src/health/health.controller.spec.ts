import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HubStatusService } from '../echocall/hub-status.service.js';
import { createHubFake } from '../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { HealthModule } from './health.module.js';

describe('HealthController', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([HealthModule]);
    await t.db.reset();
    await t.moduleRef.get(HubStatusService).refresh();
  });

  afterAll(async () => {
    await t.close();
  });

  const api = () => request(t.app.getHttpServer());

  it('answers the liveness probe without a session and without the api prefix', async () => {
    const res = await api().get('/healthz').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('reports ready when the database answers and the hub accepts the key', async () => {
    const res = await api().get('/readyz').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe(true);
    expect(res.body.hub.ok).toBe(true);
  });

  it('keeps the account behind the key out of the probe', async () => {
    const res = await api().get('/readyz').expect(200);
    // The probe is reachable without a session, so it says whether the service
    // answers and when it was asked, not who the key belongs to.
    expect(res.body.hub).toEqual({ ok: true, checkedAt: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toContain('operator@example.com');
  });

  it('reports degraded with a 503 when the hub rejects the key', async () => {
    const rejecting = await createTestApp([HealthModule], {
      hub: createHubFake({
        'GET /users/me': { status: 401, body: { error: { code: 'invalid_api_key', message: 'nope' } } },
      }),
    });
    try {
      await rejecting.moduleRef.get(HubStatusService).refresh();
      const res = await request(rejecting.app.getHttpServer()).get('/readyz').expect(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.database).toBe(true);
      expect(res.body.hub.ok).toBe(false);
      // Not even the reason: what the service answered belongs in the log and
      // in the admin overview, not in an answer to whoever asks.
      expect(JSON.stringify(res.body)).not.toContain('nope');
    } finally {
      await rejecting.close();
    }
  });
});
