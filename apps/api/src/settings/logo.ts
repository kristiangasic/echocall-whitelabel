/**
 * Checks a logo before it is stored.
 *
 * A PNG or a JPEG is a grid of colours and can do nothing but be looked at. An
 * SVG is a document: it can carry script, load something from another server,
 * or pull in a file from the server it runs on. The logo is shown to everyone
 * who opens the portal, so an SVG is only stored when it is a drawing and
 * nothing else.
 */

/** Element names that make an SVG act instead of draw. */
const ACTIVE_ELEMENTS = /<\s*(script|foreignobject|iframe|embed|object|handler|audio|video)\b/i;

/** Any attribute whose name starts with "on" is an event handler. */
const EVENT_ATTRIBUTE = /[\s"'/]on[a-z]+\s*=/i;

/** A link that runs code when it is followed. */
const SCRIPT_LINK = /(javascript|vbscript)\s*:/i;

/**
 * An embedded file that is not a picture. A drawing may carry a PNG inside it,
 * which is only pixels, but anything else is a document in disguise.
 */
const EMBEDDED_DOCUMENT =
  /(?:xlink:)?(?:href|src)\s*=\s*["']?\s*data:(?!image\/(?:png|jpe?g|gif|webp);base64,)/i;

/** A reference that reaches another server while the logo is shown. */
const REMOTE_REFERENCE = /(?:xlink:)?(?:href|src)\s*=\s*["']?\s*(?:[a-z]+:)?\/\//i;
const REMOTE_STYLE = /(?:url\(\s*["']?\s*(?:[a-z]+:)?\/\/|@import)/i;

/** A document that defines its own entities can be made to read local files. */
const ENTITY = /<!ENTITY/i;

/**
 * The namespaces every drawing program writes into its files. They are web
 * addresses that name a vocabulary, not addresses anything is loaded from, so
 * they are taken out before the remaining addresses are judged.
 */
const NAMESPACE_ATTRIBUTE = /xmlns(:[a-z0-9-]+)?\s*=\s*(["'])[^"']*\2/gi;
const RDF_ABOUT = /(rdf:)?(about|resource|datatype)\s*=\s*(["'])[^"']*\3/gi;

/** Whether this SVG source is a drawing and nothing more. */
export function svgIsInert(source: string): boolean {
  const drawing = source.replace(NAMESPACE_ATTRIBUTE, '').replace(RDF_ABOUT, '');
  if (ENTITY.test(drawing)) return false;
  if (ACTIVE_ELEMENTS.test(drawing)) return false;
  if (EVENT_ATTRIBUTE.test(drawing)) return false;
  if (SCRIPT_LINK.test(drawing)) return false;
  if (EMBEDDED_DOCUMENT.test(drawing)) return false;
  if (REMOTE_REFERENCE.test(drawing)) return false;
  if (REMOTE_STYLE.test(drawing)) return false;
  return true;
}

/**
 * Whether a logo may be stored. Only an SVG is read; every other format is a
 * picture and carries nothing that can act.
 */
export function logoIsInert(dataUrl: string): boolean {
  const match = /^data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (match === null) return true;

  let source: string;
  try {
    source = Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return false;
  }
  if (!/<svg[\s>]/i.test(source)) return false;
  return svgIsInert(source);
}
