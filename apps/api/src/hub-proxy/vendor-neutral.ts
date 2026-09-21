/**
 * Some texts the service returns name the service itself: a catalogue entry
 * that offers to connect "EchoCall" to five thousand apps reads wrong in a
 * portal that carries the operator's own name, and tells the customer who
 * really runs the platform.
 *
 * The portal renames it on the way out. Only display text is touched: keys
 * keep their spelling, and a value that is an address is left alone, because
 * an authorisation link rewritten is an authorisation link broken.
 */

/** The service's product name, as it appears in prose rather than in a domain. */
const PRODUCT_NAME = /\bEchoCall\b/g;

/** A value that addresses something rather than describing it. */
const ADDRESS = /^(https?:|mailto:|data:|\/)/i;

/**
 * Keys whose value names a setting instead of describing one. The service
 * identifies its language models by names that carry its own product name, and
 * the portal hands those back unchanged when a customer saves an agent. Renamed,
 * such a value no longer matches anything the service knows, so the model field
 * shows up empty and a save would store a setting that does not exist.
 */
const SETTING_KEYS = new Set(['llmModel', 'ttsModel', 'model']);

/**
 * Replaces the service's product name with the portal's own, everywhere in a
 * decoded JSON body. Anything that is not a string is passed through as it is.
 */
export function renameProduct<T>(body: T, productName: string): T {
  return map(body, productName, null) as T;
}

function map(value: unknown, productName: string, key: string | null): unknown {
  if (typeof value === 'string') {
    if (ADDRESS.test(value)) return value;
    if (key !== null && SETTING_KEYS.has(key)) return value;
    return value.replace(PRODUCT_NAME, productName);
  }
  if (Array.isArray(value)) return value.map((entry) => map(entry, productName, key));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entry]) => [
        entryKey,
        map(entry, productName, entryKey),
      ]),
    );
  }
  return value;
}

/** Keys whose value is a link the portal offers the customer to open and read. */
const DOCUMENTATION_KEYS = new Set(['documentation', 'documentationUrl', 'docsUrl', 'helpUrl']);

/**
 * Drops a documentation link that points back at the platform this portal runs
 * on. The catalogue of connectors names the manual of each service, and for the
 * connectors the platform provides itself that manual is the platform's own: a
 * link the customer would follow to find out whose portal this really is. Links
 * to the connected services are left alone, because those are the ones the
 * customer came for.
 */
export function hideOwnDocumentation<T>(body: T, apiUrl: string): T {
  const domain = registrableDomain(apiUrl);
  if (domain === null) return body;
  return strip(body, domain) as T;
}

function strip(value: unknown, domain: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => strip(entry, domain));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) =>
      DOCUMENTATION_KEYS.has(key) && typeof entry === 'string' && pointsAt(entry, domain)
        ? [key, null]
        : [key, strip(entry, domain)],
    ),
  );
}

/** Whether a link leads to the given domain or to anything under it. */
function pointsAt(link: string, domain: string): boolean {
  let host: string;
  try {
    host = new URL(link).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * The domain a host is registered under, so that a manual on one machine of the
 * platform is recognised from the address of another.
 */
function registrableDomain(apiUrl: string): string | null {
  let host: string;
  try {
    host = new URL(apiUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  const labels = host.split('.');
  return labels.length < 3 ? host : labels.slice(-2).join('.');
}
