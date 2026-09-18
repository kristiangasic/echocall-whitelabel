/**
 * What the portal's own trail recorded, read as words. The trail is written for
 * the machine: an action is a key and what came with it is a payload. An
 * operator looking for what happened to an account should not have to read
 * either, so both are turned into the operator's language here, and anything
 * the portal has no wording for still shows rather than disappearing.
 */

/** How a component hands its own translations to these functions. */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/** A field whose value names other fields, so its values read as labels too. */
const FIELDS_OF_FIELDS = new Set(['changed']);

/** What separates one recorded value from the next. */
const SEPARATOR = ' · ';

/** The recorded action in the operator's words, or its key when there are none. */
export function auditAction(action: string, t: Translate): string {
  return text(`admin.audit.actions.${asKey(action)}`, action, t);
}

/** Everything one entry recorded, as a line of labelled values. */
export function auditDetails(details: Record<string, unknown> | null | undefined, t: Translate): string {
  if (!details) return '';
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${fieldLabel(key, t)}: ${plain(key, value, t)}`)
    .join(SEPARATOR);
}

/** What one entry concerned: the kind of thing, and which one of them. */
export function auditTarget(
  targetType: string | null | undefined,
  targetId: number | string | null | undefined,
  t: Translate,
): string {
  if (!targetType) return '';
  const kind = text(`admin.audit.targets.${asKey(targetType)}`, spellOut(targetType), t);
  return targetId === null || targetId === undefined || targetId === '' ? kind : `${kind} #${targetId}`;
}

/** The name of a recorded field, or the key written the way a reader would. */
function fieldLabel(key: string, t: Translate): string {
  return text(`admin.audit.fields.${asKey(key)}`, spellOut(key), t);
}

/** One recorded value, whatever shape it was stored in. */
function plain(key: string, value: unknown, t: Translate): string {
  if (typeof value === 'boolean') return t(value ? 'admin.audit.yes' : 'admin.audit.no');
  if (Array.isArray(value)) return value.map((entry) => plain(key, entry, t)).join(', ');
  if (typeof value === 'string' && FIELDS_OF_FIELDS.has(key)) return fieldLabel(value, t);
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** A translation, or the fallback when the portal carries none for that key. */
function text(key: string, fallback: string, t: Translate): string {
  const translated = t(key);
  return translated === key || translated === '' ? fallback : translated;
}

/** A stored key as a translation key can spell it: dots are path separators. */
function asKey(key: string): string {
  return key.replace(/\./g, '_');
}

/** A stored key as a reader would write it: defaultPlanId becomes Default plan id. */
function spellOut(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._-]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}
