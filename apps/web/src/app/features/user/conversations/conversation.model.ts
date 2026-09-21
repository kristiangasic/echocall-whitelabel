import type { Conversation, LiveConversation } from '../../../core/hub/hub.models';

/** A row of the conversation list: either a phone call or a chat thread. */
export type AnyConversation = Conversation | LiveConversation;

/** True for chat threads, which are the ones that carry a transcript and can be replied to. */
export function isChat(conversation: AnyConversation): conversation is LiveConversation {
  return conversation.type === 'chat';
}

/** Who the conversation was with: the visitor for chats, the other number for calls. */
export function conversationTitle(conversation: AnyConversation): string {
  if (isChat(conversation)) {
    // An older installation can leave the visitor's session out, and a list
    // reading "#undefined" helps nobody. The conversation's own number stands in.
    return (
      conversation.visitorName || conversation.visitorEmail || `#${conversation.visitorId || conversation.id}`
    );
  }
  const number = conversation.direction === 'outbound' ? conversation.toNumber : conversation.fromNumber;
  return number || `#${conversation.id}`;
}
