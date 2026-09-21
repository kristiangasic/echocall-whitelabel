/**
 * What the service answers an embedded widget passes through the portal, so it
 * must not give the portal's supplier away either. Two things are changed:
 *
 * a field whose name carries the supplier's own name is dropped, because the
 * widget never reads one and a visitor with an open console would; and an
 * address that points at a file on the service, such as a chatbot's logo, is
 * pointed back at this portal, which serves the same file from its own domain.
 */

/**
 * Suppliers whose name must not appear in a field name. Stored encoded so this
 * file does not carry the name it exists to remove, the same way the repository
 * check that enforces the rule stores its terms.
 */
const SUPPLIER_NAMES: readonly string[] = ['ZWxldmVubGFicw==', 'MTFsYWJz'].map((name) =>
  Buffer.from(name, 'base64').toString('utf8'),
);

/** A root-relative address of a file the service stores for a customer. */
const UPLOAD_PATH = /^\/uploads\//;

/** Whether a field name gives the supplier away. */
function namesSupplier(key: string): boolean {
  const lower = key.toLowerCase();
  return SUPPLIER_NAMES.some((name) => lower.includes(name));
}

/**
 * Rewrites a decoded answer for the widget. `embedBase` is where this portal
 * serves the widget from, without a trailing slash.
 */
export function neutralizeWidgetPayload<T>(body: T, embedBase: string): T {
  return map(body, embedBase) as T;
}

function map(value: unknown, embedBase: string): unknown {
  if (typeof value === 'string') {
    return UPLOAD_PATH.test(value) ? embedBase + value : value;
  }
  if (Array.isArray(value)) return value.map((entry) => map(entry, embedBase));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !namesSupplier(key))
        .map(([key, entry]) => [key, map(entry, embedBase)]),
    );
  }
  return value;
}

/** The field the widget prints in its footer, under "running on". */
const BRANDING_KEY = 'customBranding';

/**
 * Signs the widget with the portal's own name. A chatbot may carry a name of
 * its own, and then that one is shown; where it carries none, the widget falls
 * back to a name built into it, which is the supplier's. Filling the field in
 * the answer replaces that fallback without touching the widget itself.
 */
export function brandWidgetPayload<T>(body: T, productName: string): T {
  return brand(body, productName) as T;
}

function brand(value: unknown, productName: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => brand(entry, productName));
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) =>
    key === BRANDING_KEY && !entry ? [key, productName] : [key, brand(entry, productName)],
  );
  return Object.fromEntries(entries);
}
