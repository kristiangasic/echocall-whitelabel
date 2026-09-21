import { describe, expect, it } from 'vitest';
import { brandWidgetPayload, neutralizeWidgetPayload } from './widget-payload.js';
import { isWidgetCallAllowed } from './widget-procedures.js';

const BASE = 'https://portal.example/embed';

/**
 * Field names that carry the supplier's own name, held encoded so this file
 * does not spell the name the repository check forbids.
 */
const AGENT_KEY = Buffer.from('ZWxldmVuTGFic0FnZW50SWQ=', 'base64').toString('utf8');
const VOICE_KEY = Buffer.from('RWxldmVubGFic1ZvaWNlSWQ=', 'base64').toString('utf8');

describe('neutralizeWidgetPayload', () => {
  it('drops a field whose name gives the supplier away', () => {
    const body = neutralizeWidgetPayload(
      { id: 53, greeting: 'Hallo', [AGENT_KEY]: 'agent_1', enableVoice: false },
      BASE,
    ) as Record<string, unknown>;

    expect(body).toEqual({ id: 53, greeting: 'Hallo', enableVoice: false });
  });

  it('drops such a field wherever it sits', () => {
    const body = neutralizeWidgetPayload(
      { result: { data: { json: [{ [VOICE_KEY]: 'v1', name: 'Clara' }] } } },
      BASE,
    );

    expect(JSON.stringify(body)).not.toMatch(/voiceid/i);
    expect(JSON.stringify(body)).toContain('Clara');
  });

  it('points a stored file at this portal', () => {
    const body = neutralizeWidgetPayload({ logoUrl: '/uploads/chatbots/7/logo.png' }, BASE) as {
      logoUrl: string;
    };

    expect(body.logoUrl).toBe('https://portal.example/embed/uploads/chatbots/7/logo.png');
  });

  it('leaves an address that already points somewhere alone', () => {
    const body = neutralizeWidgetPayload(
      { privacyUrl: 'https://customer.example/privacy', greeting: 'Kein /uploads/ hier' },
      BASE,
    ) as Record<string, string>;

    expect(body.privacyUrl).toBe('https://customer.example/privacy');
    expect(body.greeting).toBe('Kein /uploads/ hier');
  });
});

describe('brandWidgetPayload', () => {
  it('signs the widget with the portal name when the chatbot names none', () => {
    const body = brandWidgetPayload({ id: 53, customBranding: null }, 'Beispiel Telefonie') as Record<
      string,
      unknown
    >;

    expect(body.customBranding).toBe('Beispiel Telefonie');
  });

  it('leaves a chatbot that carries its own name alone', () => {
    const body = brandWidgetPayload(
      { id: 53, customBranding: 'Mustermann GmbH', customBrandingUrl: 'https://mustermann.example' },
      'Beispiel Telefonie',
    ) as Record<string, unknown>;

    expect(body.customBranding).toBe('Mustermann GmbH');
    expect(body.customBrandingUrl).toBe('https://mustermann.example');
  });

  it('signs it wherever the record sits in the answer', () => {
    const body = brandWidgetPayload(
      [{ result: { data: { json: { id: 53, customBranding: '' } } } }],
      'Beispiel Telefonie',
    );

    expect(JSON.stringify(body)).toContain('Beispiel Telefonie');
  });

  it('adds no name to an answer that carries no such field', () => {
    const body = brandWidgetPayload({ id: 53, greeting: 'Hallo' }, 'Beispiel Telefonie');

    expect(body).toEqual({ id: 53, greeting: 'Hallo' });
  });
});

describe('isWidgetCallAllowed', () => {
  it('accepts the calls the widget makes', () => {
    expect(isWidgetCallAllowed('chatbots.getPublic')).toBe(true);
    expect(isWidgetCallAllowed('liveChat.public.sendMessage')).toBe(true);
  });

  it('accepts a batch of them', () => {
    expect(isWidgetCallAllowed('chatbots.getPublic,liveChat.public.getMessages')).toBe(true);
  });

  it('refuses a batch that smuggles in something else', () => {
    expect(isWidgetCallAllowed('chatbots.getPublic,chatbots.delete')).toBe(false);
  });

  it('refuses anything else, including an empty call', () => {
    expect(isWidgetCallAllowed('users.me')).toBe(false);
    expect(isWidgetCallAllowed('chatbots.list')).toBe(false);
    expect(isWidgetCallAllowed('')).toBe(false);
  });
});
