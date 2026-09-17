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
