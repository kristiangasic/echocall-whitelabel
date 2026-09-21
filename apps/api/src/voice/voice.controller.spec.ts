import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthModule } from '../auth/auth.module.js';
import { createResellerHubFake, type HubFakeCall } from '../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { type SignedInUser, signInAs } from '../testing/users.js';
import { redeemVoiceTicket, resetVoiceTickets, VOICE_STREAM_PATH } from './voice-relay.js';
import { VoiceModule } from './voice.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

/** A few bytes standing in for the spoken sample. */
const SAMPLE = Buffer.from('ID3 spoken sample');

const CALL = {
  streamPath: '/ws/agent-preview?t=service-ticket',
  maxSeconds: 300,
  expiresInSeconds: 60,
  agent: { id: 'agent_7', name: 'Empfang', firstMessage: 'Guten Tag', language: 'de' },
};

/** What the fake hub was asked, as a path and its query apart. */
function asked(call: HubFakeCall | undefined): { path: string; query: URLSearchParams } {
  const url = new URL(call?.path ?? '/', 'http://service');
  return { path: url.pathname, query: url.searchParams };
}

describe('VoiceController', () => {
  let t: TestApp;
  let user: SignedInUser;
  let stranger: SignedInUser;
  let admin: SignedInUser;

  beforeAll(async () => {
    const hub = createResellerHubFake({
      'GET /voices/v-clara/preview': {
        binary: SAMPLE,
        contentType: 'audio/mpeg',
        headers: { 'content-language': 'de' },
      },
      'POST /agents/agent_7/preview': { body: CALL },
    });
    t = await createTestApp([AuthModule, VoiceModule], { hub });
    await t.db.reset();
    user = await signInAs(t, { email: 'user@example.com', role: 'user', echocallCustomerId: 501 });
    stranger = await signInAs(t, { email: 'neu@example.com', role: 'user', echocallCustomerId: null });
    admin = await signInAs(t, { email: 'admin@example.com', role: 'admin' });
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => resetVoiceTickets());

  const api = () => request(t.app.getHttpServer());

  it('plays a sample of a voice, in the language asked for', async () => {
    const res = await api()
      .get('/api/voice/voices/v-clara/sample?language=de')
      .set('Cookie', user.cookie)
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(res.headers['content-language']).toBe('de');
    expect(res.headers['cache-control']).toContain('private');
    expect(Buffer.from(res.body)).toEqual(SAMPLE);

    const call = asked(t.hub.calls.findLast((c) => c.path.startsWith('/voices/v-clara/preview')));
    expect(call.query.get('language')).toBe('de');
    const headers = t.hub.calls.findLast((c) => c.path.startsWith('/voices/v-clara/preview'))?.headers;
    expect(headers?.get('x-echocall-customer')).toBe('501');
  });

  it('asks for no particular language when none was named', async () => {
    const res = await api()
      .get('/api/voice/voices/v-clara/sample')
      .set('Cookie', user.cookie)
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(
      asked(t.hub.calls.findLast((c) => c.path.startsWith('/voices/v-clara/preview'))).query.has('language'),
    ).toBe(false);
  });

  it('refuses a voice or a language that is not one', async () => {
    const bad = await api().get('/api/voice/voices/..%2F..%2Fetc/sample').set('Cookie', user.cookie);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_id');

    const worse = await api()
      .get('/api/voice/voices/v-clara/sample?language=de;rm')
      .set('Cookie', user.cookie);
    expect(worse.status).toBe(400);
    expect(worse.body.error.code).toBe('invalid_language');
  });

  it('answers 502 when the service sends something other than audio', async () => {
    t.hub.on('GET /voices/v-clara/preview', { body: { audioUrl: 'https://service.example/sample.mp3' } });
    try {
      const res = await api().get('/api/voice/voices/v-clara/sample').set('Cookie', user.cookie);
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('preview_unavailable');
    } finally {
      t.hub.on('GET /voices/v-clara/preview', {
        binary: SAMPLE,
        contentType: 'audio/mpeg',
        headers: { 'content-language': 'de' },
      });
    }
  });

  it('starts a test call over this portal, never over the service', async () => {
    const res = await api()
      .post('/api/voice/agents/agent_7/call')
      .set('Cookie', user.cookie)
      .set(XHR)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.streamPath.startsWith(`${VOICE_STREAM_PATH}?t=`)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('service-ticket');
    expect(res.body.maxSeconds).toBe(300);
    expect(res.body.agent).toEqual(CALL.agent);

    // The ticket the browser was given stands for the service address.
    const token = new URL(res.body.streamPath, 'http://portal').searchParams.get('t') ?? '';
    expect(redeemVoiceTicket(token)?.serviceUrl).toBe(
      'wss://hub.echocall.de/ws/agent-preview?t=service-ticket',
    );
  });

  it('answers 502 when the service starts no call', async () => {
    t.hub.on('POST /agents/agent_7/preview', { body: { agent: { id: 'agent_7' } } });
    try {
      const res = await api()
        .post('/api/voice/agents/agent_7/call')
        .set('Cookie', user.cookie)
        .set(XHR)
        .send({});
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('call_unavailable');
    } finally {
      t.hub.on('POST /agents/agent_7/preview', { body: CALL });
    }
  });

  it('passes a refusal of the service through with its own status', async () => {
    t.hub.on('POST /agents/agent_7/preview', {
      status: 402,
      body: { error: { code: 'quota_exceeded', message: 'No voice minutes left on this account.' } },
    });
    try {
      const res = await api()
        .post('/api/voice/agents/agent_7/call')
        .set('Cookie', user.cookie)
        .set(XHR)
        .send({});
      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('quota_exceeded');
    } finally {
      t.hub.on('POST /agents/agent_7/preview', { body: CALL });
    }
  });

  it('is closed to anyone but a customer of this portal', async () => {
    expect((await api().get('/api/voice/voices/v-clara/sample')).status).toBe(401);
    expect((await api().get('/api/voice/voices/v-clara/sample').set('Cookie', admin.cookie)).status).toBe(
      403,
    );

    const res = await api().get('/api/voice/voices/v-clara/sample').set('Cookie', stranger.cookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('customer_not_linked');
  });
});
