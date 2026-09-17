import { describe, expect, it } from 'vitest';
import { isRewritableType, rewriteWidgetSource } from './widget-rewrite.js';

const OPTIONS = { widgetOrigin: 'https://widgets.example.com', embedBase: 'https://portal.example/embed' };

describe('rewriteWidgetSource', () => {
  it('renames the global the loader sets on the customer page', () => {
    const result = rewriteWidgetSource(
      'if (window.EchoCallInitialized) return;\nwindow.EchoCallInitialized = true;',
      OPTIONS,
    );

    expect(result).not.toContain('EchoCallInitialized');
    expect(result).toContain('window.ChatWidgetInitialized = true;');
  });

  it('renames the frame id and the message types on both ends alike', () => {
    const loader = rewriteWidgetSource("frame.id = 'echocall-widget-iframe';", OPTIONS);
    const bundle = rewriteWidgetSource("parent.postMessage({type:'echocall-widget-opened'})", OPTIONS);

    expect(loader).toContain("frame.id = 'chat-widget-iframe';");
    expect(bundle).toContain("type:'chat-widget-opened'");
  });

  it('points every address back at the portal, whatever the widget falls back to', () => {
    const result = rewriteWidgetSource(
      "var base = src ? src.slice(0, i) : 'https://hub.echocall.de';\nfetch('https://widgets.example.com/assets/app.js')",
      OPTIONS,
    );

    expect(result).not.toContain('echocall.de');
    expect(result).not.toContain('widgets.example.com');
    expect(result).toContain("'https://portal.example/embed'");
    expect(result).toContain("fetch('https://portal.example/embed/assets/app.js')");
  });

  it('ignores a trailing slash on the configured origin', () => {
    const result = rewriteWidgetSource('https://widgets.example.com/widget.html', {
      ...OPTIONS,
      widgetOrigin: 'https://widgets.example.com/',
    });

    expect(result).toBe('https://portal.example/embed/widget.html');
  });

  it('leaves a body that names nothing of the service untouched', () => {
    const source = 'export const open = () => document.body.classList.add("open");';

    expect(rewriteWidgetSource(source, OPTIONS)).toBe(source);
  });
});

describe('isRewritableType', () => {
  it('accepts the text the widget is made of', () => {
    expect(isRewritableType('application/javascript; charset=utf-8')).toBe(true);
    expect(isRewritableType('text/html')).toBe(true);
    expect(isRewritableType('text/css')).toBe(true);
  });

  it('leaves binary assets alone', () => {
    expect(isRewritableType('image/png')).toBe(false);
    expect(isRewritableType('font/woff2')).toBe(false);
    expect(isRewritableType('application/octet-stream')).toBe(false);
  });
});
