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
 * Replaces the service's product name with the portal's own, everywhere in a
 * decoded JSON body. Anything that is not a string is passed through as it is.
 */
export function renameProduct<T>(body: T, productName: string): T {
  return map(body, productName) as T;
}

function map(value: unknown, productName: string): unknown {
  if (typeof value === 'string') {
    if (ADDRESS.test(value)) return value;
    return value.replace(PRODUCT_NAME, productName);
  }
  if (Array.isArray(value)) return value.map((entry) => map(entry, productName));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, map(entry, productName)]),
    );
  }
  return value;
}
