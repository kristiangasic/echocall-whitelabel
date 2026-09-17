/**
 * The chat widget is built by the service the portal buys from, so its files
 * carry that service's names: a global it sets on the customer page, the id of
 * the frame it injects, the message types the loader and the frame exchange,
 * and the address it falls back to when it cannot work out its own. A visitor
 * who opens the console on a customer site reads all of them.
 *
 * The portal serves those files from its own domain, so it renames them on the
 * way out. Every file the widget loads passes through here, loader, frame and
 * bundles alike, so both ends of a message keep speaking the same language.
 */

/** Media types whose bodies are text we may rewrite. */
const TEXT_TYPES = /^(text\/|application\/(javascript|ecmascript|json|xml))/i;

/** Names the widget uses for itself, and what the portal calls them instead. */
const RENAMES: readonly (readonly [RegExp, string])[] = [
  [/EchoCallInitialized/g, 'ChatWidgetInitialized'],
  [/echocall-widget/g, 'chat-widget'],
  [/EchoCallWidget/g, 'ChatWidget'],
];

/** True when a body of this media type is text the rewrite understands. */
export function isRewritableType(contentType: string): boolean {
  return TEXT_TYPES.test(contentType);
}

/**
 * Renames the widget's own identifiers and replaces every address that points
 * back at the service with the portal's own embed path.
 *
 * `widgetOrigin` is where the portal fetched the file from and `embedBase` is
 * where it serves it, both without a trailing slash.
 */
export function rewriteWidgetSource(
  source: string,
  options: { widgetOrigin: string; embedBase: string },
): string {
  let result = source;
  for (const [pattern, replacement] of RENAMES) {
    result = result.replace(pattern, replacement);
  }
  for (const origin of originsToHide(options.widgetOrigin)) {
    result = result.split(origin).join(options.embedBase);
  }
  return result;
}

/**
 * The addresses that must not survive: the origin this portal fetched from,
 * and the public address the widget falls back to when it cannot find its own
 * script tag. Longest first, so a longer address is replaced before a shorter
 * one that is a prefix of it.
 */
function originsToHide(widgetOrigin: string): string[] {
  const configured = widgetOrigin.replace(/\/+$/, '');
  const known = ['https://hub.echocall.de', 'https://echocall.de'];
  const all = configured ? [configured, ...known] : known;
  return [...new Set(all)].sort((a, b) => b.length - a.length);
}
