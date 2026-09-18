import { describe, expect, it } from 'vitest';
import { hideOwnDocumentation, renameProduct } from './vendor-neutral.js';

describe('renameProduct', () => {
  it('renames the service in the text a customer reads', () => {
    const result = renameProduct(
      { description: 'Connect EchoCall to 5000+ apps through Zapier.' },
      'Acme Voice',
    );

    expect(result.description).toBe('Connect Acme Voice to 5000+ apps through Zapier.');
  });

  it('reaches into nested objects and arrays', () => {
    const result = renameProduct({ data: [{ name: 'EchoCall Webhook', tags: ['EchoCall'] }] }, 'Acme Voice');

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

describe('hideOwnDocumentation', () => {
  const API = 'https://hub.echocall.de/api/v1';

  it('drops a manual that leads back to the platform behind the portal', () => {
    const result = hideOwnDocumentation({ documentation: 'https://docs.echocall.de/webhooks' }, API);

    expect(result.documentation).toBeNull();
  });

  it('keeps the manual of the service the customer is connecting to', () => {
    const result = hideOwnDocumentation({ documentation: 'https://cal.com/docs/api-reference' }, API);

    expect(result.documentation).toBe('https://cal.com/docs/api-reference');
  });

  it('works through the list the catalogue comes in', () => {
    const result = hideOwnDocumentation(
      { data: [{ type: 'webhook', docsUrl: 'https://hub.echocall.de/docs' }] },
      API,
    );

    expect(result.data[0]).toEqual({ type: 'webhook', docsUrl: null });
  });

  it('leaves every other link alone, including one to the platform', () => {
    const result = hideOwnDocumentation(
      { authorizeUrl: 'https://hub.echocall.de/oauth/authorize', note: 'See https://docs.echocall.de' },
      API,
    );

    expect(result.authorizeUrl).toBe('https://hub.echocall.de/oauth/authorize');
    expect(result.note).toBe('See https://docs.echocall.de');
  });

  it('passes a value through that is not a link at all', () => {
    const result = hideOwnDocumentation({ documentation: 'Ask support' }, API);

    expect(result.documentation).toBe('Ask support');
  });
});
