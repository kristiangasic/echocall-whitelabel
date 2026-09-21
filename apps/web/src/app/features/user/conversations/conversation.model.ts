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

/** A call's length as minutes and seconds; nothing for a chat or a call still running. */
export function conversationDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '';
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

/** The status in the reader's language when the portal knows it, otherwise as the service reports it. */
export function conversationStatusLabel(t: (key: string) => string, conversation: AnyConversation): string {
  const status = conversation.status;
  if (!status) return '';
  const key = `user.conversations.statuses.${status}`;
  const label = t(key);
  return label && label !== key ? label : status;
}
