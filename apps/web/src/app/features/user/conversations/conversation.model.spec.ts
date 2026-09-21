import type { AnyConversation } from './conversation.model';
import { conversationTitle, isChat } from './conversation.model';

function chat(fields: Record<string, unknown>): AnyConversation {
  return { type: 'chat', id: 4820, ...fields } as unknown as AnyConversation;
}

function call(fields: Record<string, unknown>): AnyConversation {
  return { type: 'voice', id: 4821, ...fields } as unknown as AnyConversation;
}

describe('conversationTitle', () => {
  it('names the visitor a chat is with', () => {
    expect(conversationTitle(chat({ visitorName: 'Ellen Ward', visitorEmail: null }))).toBe('Ellen Ward');
  });

  it('falls back to the address when the visitor gave no name', () => {
    expect(conversationTitle(chat({ visitorName: null, visitorEmail: 'e.ward@example.com' }))).toBe(
      'e.ward@example.com',
    );
  });

  it('falls back to the session the visitor was given', () => {
    expect(conversationTitle(chat({ visitorName: null, visitorEmail: null, visitorId: 'v-7f31' }))).toBe(
      '#v-7f31',
    );
  });

  it('names the conversation itself when the service sends no visitor at all', () => {
    // A portal talks to installations it does not control, and an older one can
    // leave the visitor out. A list reading "#undefined" helps nobody.
    expect(conversationTitle(chat({ visitorName: null, visitorEmail: null }))).toBe('#4820');
  });

  it('names the other number of a call', () => {
    expect(conversationTitle(call({ direction: 'inbound', fromNumber: '+442079460815' }))).toBe(
      '+442079460815',
    );
    expect(conversationTitle(call({ direction: 'outbound', toNumber: '+442071838290' }))).toBe(
      '+442071838290',
    );
  });

  it('names the conversation itself when a call carries no number', () => {
    expect(conversationTitle(call({ direction: 'inbound', fromNumber: null }))).toBe('#4821');
  });
});

describe('isChat', () => {
  it('tells the two kinds of conversation apart', () => {
    expect(isChat(chat({}))).toBe(true);
    expect(isChat(call({}))).toBe(false);
  });
});
