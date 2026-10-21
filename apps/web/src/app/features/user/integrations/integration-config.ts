/** What the service puts in place of a stored secret when it returns a configuration. */
export const MASKED = '********';

/**
 * Reads the configuration of an integration, which travels as a JSON string.
 * Masked secrets are dropped: an empty field means "keep what is stored", and
 * sending the mask back would overwrite the secret with asterisks.
 */
export function parseConfig(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const config: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === null || value === undefined || value === MASKED) continue;
    if (typeof value === 'object') config[key] = JSON.stringify(value);
    else config[key] = String(value);
  }
  return config;
}

/**
 * Keys the service manages itself and changes through their own endpoints, such
 * as the tool permissions. They are never sent with the configuration.
 */
const SERVICE_KEYS = new Set(['toolPermissions']);

/** The configuration as the service sent it, every value in its own type. */
export function rawConfig(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return { ...(parsed as Record<string, unknown>) };
}

/**
 * The configuration to send. The service replaces the stored configuration as a
 * whole, so every key it sent goes back in the type it had: a list stays a list
 * and a number stays a number, also for keys the form does not show. The fields
 * the form shows send what was typed; an empty field or a masked value is left
 * out, so the stored secret stays.
 */
export function configPayload(
  loaded: Record<string, unknown>,
  typed: Record<string, string>,
  shown: ReadonlySet<string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(loaded)) {
    if (SERVICE_KEYS.has(key) || shown.has(key)) continue;
    if (value === null || value === undefined || value === MASKED) continue;
    payload[key] = value;
  }
  for (const [key, value] of Object.entries(typed)) {
    if (SERVICE_KEYS.has(key) || value === '' || value === MASKED) continue;
    if (!shown.has(key) && Object.prototype.hasOwnProperty.call(loaded, key)) continue;
    payload[key] = inTypeOf(value, loaded[key]);
  }
  return payload;
}

/** A typed value back in the type the loaded one had, when it still reads as that type. */
function inTypeOf(value: string, loaded: unknown): unknown {
  if (typeof loaded === 'number') {
    const number = Number(value.trim());
    return value.trim() !== '' && Number.isFinite(number) ? number : value;
  }
  if (typeof loaded === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }
  if (loaded !== null && typeof loaded === 'object') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed) === Array.isArray(loaded)) {
        return parsed;
      }
    } catch {
      // Not JSON any more: what was typed is sent as it is.
    }
  }
  return value;
}

/**
 * The top-level keys the service sent masked. Beyond the fields declared as
 * passwords this covers secrets that travel in a `url` or `text` field, such as
 * a Discord webhook URL or a verify token, so their form fields can say that
 * the stored value is kept.
 */
export function maskedKeys(raw: string | null | undefined): Set<string> {
  const keys = new Set<string>();
  if (!raw) return keys;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return keys;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return keys;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === MASKED) keys.add(key);
  }
  return keys;
}
