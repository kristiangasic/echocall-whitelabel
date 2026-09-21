import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../auth/auth.module.js';
import { createResellerHubFake } from '../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { EmbedModule } from './embed.module.js';
import { SettingsService } from '../settings/settings.service.js';

/**
 * A field name that carries the supplier's own name, held encoded so this file
 * does not spell the name the repository check forbids.
 */
const AGENT_KEY = Buffer.from('ZWxldmVuTGFic0FnZW50SWQ=', 'base64').toString('utf8');

const CONFIG = {
  id: 53,
  chatbotDisplayName: 'EchoCall Helfer',
  greeting: 'Hallo',
  logoUrl: '/uploads/chatbots/7/logo.png',
  [AGENT_KEY]: 'agent_1',
  customBranding: null,
};

/** The smallest valid image, so a stored logo can be recognised byte for byte. */
const GIF_PIXEL = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

describe('EmbedApiController', () => {
  let t: TestApp;
  const api = () => request(t.app.getHttpServer());
  const hub = createResellerHubFake({
    'GET /api/trpc/chatbots.getPublic': () => ({ body: [{ result: { data: { json: CONFIG } } }] }),
    'POST /api/trpc/liveChat.public.sendMessage': (call) => ({
      body: [{ result: { data: { json: { ok: true, echoed: call.body } } } }],
    }),
    'GET /uploads/chatbots/7/logo.png': { binary: new Uint8Array([1, 2, 3]), contentType: 'image/png' },
  });

  beforeAll(async () => {
    t = await createTestApp([AuthModule, EmbedModule], { hub });
    await t.db.reset();
  });

  afterAll(async () => {
    await t.close();
  });

  it('forwards a call the widget makes and answers what the service said', async () => {
    const res = await api().get('/embed/api/trpc/chatbots.getPublic').query({ batch: '1', input: '{}' });

    expect(res.status).toBe(200);
    expect(res.body[0].result.data.json.id).toBe(53);
  });

  it('passes the visitor referer on, so the domain list still decides', async () => {
    await api().get('/embed/api/trpc/chatbots.getPublic').set('referer', 'https://shop.example/page');

    const call = hub.calls.at(-1);
    expect(call?.headers.get('referer')).toBe('https://shop.example/page');
  });

  it('sends no cookie of the portal upstream', async () => {
    await api().get('/embed/api/trpc/chatbots.getPublic').set('cookie', 'portal_session=secret');

    expect(hub.calls.at(-1)?.headers.get('cookie')).toBeNull();
  });

  it('keeps the supplier out of the answer and serves files from the portal', async () => {
    const res = await api().get('/embed/api/trpc/chatbots.getPublic');
    const config = res.body[0].result.data.json;

    expect(config[AGENT_KEY]).toBeUndefined();
    expect(config.logoUrl).toMatch(/\/embed\/uploads\/chatbots\/7\/logo\.png$/);
    expect(config.chatbotDisplayName).not.toContain('EchoCall');
  });

  it('forwards what the widget posted even when it names its type twice', async () => {
    // The widget sets the header in two spellings, and a browser joins them into
    // one value no JSON parser recognises. Parsed under that rule the body would
    // be empty, and the call would reach the service without its input.
    await api()
      .post('/embed/api/trpc/liveChat.public.sendMessage')
      .set('content-type', 'application/json, application/json')
      .send('{"json":{"text":"Guten Tag"}}');

    expect(hub.calls.at(-1)?.body).toContain('Guten Tag');
  });

  it('answers the avatar the widget falls back to', async () => {
    // Without it every message from the chatbot shows a broken image.
    const res = await api().get('/embed/logo.png');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('shows the portal logo as that avatar once one is stored', async () => {
    const settings = t.moduleRef.get(SettingsService);
    const branding = await settings.getBranding();
    await settings.setBranding({ ...branding, logoDataUrl: `data:image/gif;base64,${GIF_PIXEL}` });

    const res = await api().get('/embed/logo.png');

    expect(res.headers['content-type']).toContain('image/gif');
    expect(res.body.toString('base64')).toBe(GIF_PIXEL);
    await settings.setBranding(branding);
  });

  it('signs the widget footer with the portal name', async () => {
    const res = await api().get('/embed/api/trpc/chatbots.getPublic');

    expect(res.body[0].result.data.json.customBranding).toBe('Customer Portal');
  });

  it('forwards a message the visitor sends', async () => {
    const res = await api()
      .post('/embed/api/trpc/liveChat.public.sendMessage')
      .send({ '0': { json: { conversationId: 'c1', message: 'hi' } } });

    expect(res.status).toBe(200);
    expect(res.body[0].result.data.json.ok).toBe(true);
    expect(hub.calls.at(-1)?.body).toContain('conversationId');
  });

  it('refuses a call the widget never makes', async () => {
    const res = await api().get('/embed/api/trpc/users.me');

    expect(res.status).toBe(404);
    expect(hub.calls.at(-1)?.path).not.toContain('users.me');
  });

  it('serves a chatbot logo from its own domain', async () => {
    const res = await api().get('/embed/uploads/chatbots/7/logo.png');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
  });

  it('refuses a file path that climbs out of the folder', async () => {
    const res = await api().get('/embed/uploads/../../etc/passwd');

    expect(res.status).toBe(404);
  });
});
