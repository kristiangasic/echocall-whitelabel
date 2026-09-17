/**
 * Formats an amount in euros for the given interface language. The hub returns
 * some amounts as decimal strings rather than floats, so both are accepted.
 */
export function formatMoney(value: number | string | null | undefined, locale: string): string {
  if (value === null || value === undefined || value === '') return '';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount)) return '';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount);
}

/**
 * Formats a price per unit, where a cent is often not fine enough: a voice
 * minute can cost 0.285 EUR. Two decimals are always shown, four at most.
 */
export function formatUnitPrice(value: number | string | null | undefined, locale: string): string {
  if (value === null || value === undefined || value === '') return '';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount)) return '';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

/**
 * Formats a percentage for the given interface language. The hub computes
 * margins in floating point, so 25 percent can arrive as 24.999999999999993.
 * At most one decimal is shown, and a trailing zero is dropped.
 */
export function formatPercent(value: number | string | null | undefined, locale: string): string {
  if (value === null || value === undefined || value === '') return '';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount)) return '';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(amount);
}
