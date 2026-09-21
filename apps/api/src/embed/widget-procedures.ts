/**
 * The calls an embedded chat widget makes. The widget runs on a stranger's
 * website with no session behind it, so the portal forwards exactly these and
 * nothing else: everything named here is answered by the service for anyone who
 * knows a chatbot's id, which is public by nature of being in the embed snippet.
 */
const WIDGET_PROCEDURES: ReadonlySet<string> = new Set([
  'chatbots.getPublic',
  'chatbots.sendMessage',
  'liveChat.public.startConversation',
  'liveChat.public.sendMessage',
  'liveChat.public.getMessages',
  'liveChat.public.getConversationStatus',
  'liveChat.public.checkAgentsOnline',
  'liveChat.public.endConversation',
  'liveChat.public.uploadFile',
]);

/**
 * Whether every procedure in a call may be forwarded. One request can carry
 * several of them, separated by commas, when the widget batches its calls.
 */
export function isWidgetCallAllowed(path: string): boolean {
  const names = path.split(',').map((name) => name.trim());
  return names.length > 0 && names.every((name) => WIDGET_PROCEDURES.has(name));
}
