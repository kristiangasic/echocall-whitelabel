/** Subscribes an endpoint to every event at once; the service confirms the value in its catalog. */
export const WILDCARD = '*';

/** The subscription list of a webhook travels as a JSON array string. */
export function parseEvents(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
