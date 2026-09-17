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
