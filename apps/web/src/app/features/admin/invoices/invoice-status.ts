/**
 * The states the hub stores on a reseller invoice, and how they are named to a
 * reader. Both invoice screens read them from here so a state the hub adds one
 * day is handled the same way in the list and on the single invoice.
 */

/** Every state the hub column holds; the list filter offers these and nothing else. */
export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'failed', 'overdue', 'canceled'] as const;

/**
 * The name of a state in the reader's language. A state the portal does not
 * know is shown as it came, which says more than an untranslated key.
 */
export function invoiceStatusLabel(status: string | null | undefined, t: (key: string) => string): string {
  if (!status) return t('admin.invoices.statuses.unknown');
  return (INVOICE_STATUSES as readonly string[]).includes(status)
    ? t(`admin.invoices.statuses.${status}`)
    : status;
}
