import { describe, expect, it } from 'vitest';
import { renameProduct } from './vendor-neutral.js';

describe('renameProduct', () => {
  it('renames the service in the text a customer reads', () => {
    const result = renameProduct(
      { description: 'Connect EchoCall to 5000+ apps through Zapier.' },
      'Acme Voice',
    );

    expect(result.description).toBe('Connect Acme Voice to 5000+ apps through Zapier.');
  });

  it('reaches into nested objects and arrays', () => {
    const result = renameProduct(
      { data: [{ name: 'EchoCall Webhook', tags: ['EchoCall'] }] },
      'Acme Voice',
    );

    expect(result).toEqual({ data: [{ name: 'Acme Voice Webhook', tags: ['Acme Voice'] }] });
  });

  it('leaves addresses alone, so authorisation links keep working', () => {
    const result = renameProduct(
      {
        authorizeUrl: 'https://hub.echocall.de/oauth/authorize?app=EchoCall',
        callback: '/api/EchoCall/callback',
        contact: 'mailto:support@echocall.de',
      },
      'Acme Voice',
    );

    expect(result.authorizeUrl).toBe('https://hub.echocall.de/oauth/authorize?app=EchoCall');
    expect(result.callback).toBe('/api/EchoCall/callback');
    expect(result.contact).toBe('mailto:support@echocall.de');
  });

  it('keeps keys and non-string values as they are', () => {
    const result = renameProduct(
      { echocallId: 7, enabled: true, missing: null, when: '2026-09-17' },
      'Acme Voice',
    );

    expect(result).toEqual({ echocallId: 7, enabled: true, missing: null, when: '2026-09-17' });
  });

  it('does not touch a longer word that merely starts the same way', () => {
    const result = renameProduct({ note: 'EchoCallable is a different word.' }, 'Acme Voice');

    expect(result.note).toBe('EchoCallable is a different word.');
  });
});
