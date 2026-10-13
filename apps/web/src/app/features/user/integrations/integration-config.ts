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
