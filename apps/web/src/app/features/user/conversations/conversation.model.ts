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
    return conversation.visitorName || conversation.visitorEmail || `#${conversation.visitorId}`;
  }
  const number = conversation.direction === 'outbound' ? conversation.toNumber : conversation.fromNumber;
  return number || `#${conversation.id}`;
}
