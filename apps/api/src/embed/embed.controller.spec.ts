import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../auth/auth.module.js';
import { createResellerHubFake } from '../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { EmbedModule } from './embed.module.js';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('EmbedController', () => {
  let t: TestApp;
  let widgetBroken = false;
  const api = () => request(t.app.getHttpServer());
  const hub = createResellerHubFake({
    'GET /widget.js': () =>
      widgetBroken
        ? { status: 500, body: { error: { code: 'internal', message: 'boom' } } }
        : { binary: text('(function(){/*loader*/})();'), contentType: 'application/javascript; charset=utf-8' },
    'GET /widget.html': {
      binary: text(
        '<html><head><script type="module" src="/assets/widget-abc.js"></script>' +
          '<link rel="stylesheet" href="/assets/widget-abc.css"></head><body></body></html>',
      ),
      contentType: 'text/html; charset=utf-8',
    },
    'GET /assets/widget-abc.css': { binary: text('.chat{color:red}'), contentType: 'text/css' },
  });

  beforeAll(async () => {
    t = await createTestApp([AuthModule, EmbedModule], { hub });
    await t.db.reset();
  });

  afterAll(async () => {
    await t.close();
  });

  it('answers 503 with a javascript comment while the widget origin is down', async () => {
    widgetBroken = true;
    const res = await api().get('/embed/chat.js');
    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.text).toMatch(/^\/\*.*\*\/$/);
    widgetBroken = false;
  });

  it('serves the loader as javascript and caches it', async () => {
    const upstream = () => hub.calls.filter((c) => c.path === '/widget.js').length;
    const before = upstream();
    const first = await api().get('/embed/chat.js');
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toContain('javascript');
    expect(first.headers['cache-control']).toBe('public, max-age=300');
    expect(first.text).toContain('/*loader*/');
    const second = await api().get('/embed/chat.js');
    expect(second.status).toBe(200);
    expect(upstream()).toBe(before + 1);
  });

  it('rewrites asset paths in widget.html and allows framing', async () => {
    const res = await api().get('/embed/widget.html?id=7&embed=true');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toBe('frame-ancestors *');
    expect(res.text).toContain('src="/embed/assets/widget-abc.js"');
    expect(res.text).toContain('href="/embed/assets/widget-abc.css"');
    expect(res.text).not.toContain('"/assets/');
  });

  it('passes assets through with their upstream content type', async () => {
    const res = await api().get('/embed/assets/widget-abc.css');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/css');
    expect(res.text).toBe('.chat{color:red}');
  });

  it('refuses asset names that leave the assets folder', async () => {
    const before = hub.calls.length;
    const res = await api().get('/embed/assets/..%2fwidget.js');
    expect(res.status).toBe(404);
    expect(hub.calls.length).toBe(before);
  });

  it('answers 503 for an asset the widget origin does not deliver', async () => {
    const res = await api().get('/embed/assets/missing.js');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('upstream_unavailable');
  });
});
