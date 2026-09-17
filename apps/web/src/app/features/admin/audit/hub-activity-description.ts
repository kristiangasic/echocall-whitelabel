import { formatMoney } from '../../../core/format/money';

/** One row of the service activity log, as far as the wording needs it. */
export interface HubActivityEntry {
  /** The service has rows whose action was never filled in; those keep the fallback. */
  action: string | null;
  description?: string | null;
  /** The facts behind the entry. The service sends an object or a JSON string. */
  metadata?: unknown;
}

/** Looks up an interface text; the second argument fills its placeholders. */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

const DETAILS = 'admin.audit.hub.details.';

/**
 * Actions whose name already carries the whole entry. "Updated customer:
 * 141467" only repeats the action and the target column, in English, so the
 * description stays empty rather than saying the same thing twice.
 */
const SELF_EXPLANATORY = new Set([
  'customer_updated',
  'customer_deleted',
  'customer_suspended',
  'customer_unsuspended',
  'payment_keys_updated',
  'company_data_updated',
  'company_profile_updated',
  'logo_updated',
  'subscription_canceled_immediate',
]);

function parseMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

const num = (value: unknown): number | null => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};

/** A day the service stored as `2026-10-17`, read in UTC so it stays that day. */
function formatDay(value: unknown, locale: string): string | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

/**
 * Words one activity entry in the operator's own language.
 *
 * The service writes each entry twice: as an English sentence for its own
 * screens, and as the facts behind that sentence. A portal that speaks German
 * or French can only use the second one, so the wording is rebuilt here from
 * the plan name, the invoice number, the amount that moved. Where a fact is
 * missing, which is the case for every entry written before the service
 * carried them, the English sentence is still better than an empty column.
 */
export function hubActivityDescription(
  entry: HubActivityEntry,
  translate: Translate,
  locale: string,
): string {
  const fallback = entry.description ?? '';
  const meta = parseMetadata(entry.metadata) ?? {};
  const money = (value: unknown): string | null => {
    const amount = num(value);
    return amount === null ? null : formatMoney(amount, locale);
  };

  switch (entry.action) {
    case 'customer_created':
      return text(meta['email']) ?? fallback;

    case 'customer_balance_adjusted': {
      const reason = text(meta['reason']);
      if (reason) return reason;
      const amount = num(meta['amount']);
      const balance = money(meta['newBalance']);
      if (amount === null || balance === null) return fallback;
      return translate(`${DETAILS}${amount < 0 ? 'balanceSubtracted' : 'balanceAdded'}`, {
        amount: formatMoney(Math.abs(amount), locale),
        balance,
      });
    }

    case 'plan_created':
    case 'plan_updated':
    case 'plan_deleted':
      return text(meta['name']) ?? fallback;

    case 'ticket_replied': {
      const subject = text(meta['subject']);
      if (!subject) return fallback;
      // An internal note never reached the customer. An operator reading the
      // log later cannot tell that from the subject alone.
      return meta['isInternal'] ? translate(`${DETAILS}internalNote`, { subject }) : subject;
    }

    case 'ticket_escalated':
      return text(meta['subject']) ?? fallback;

    case 'ticket_status_updated': {
      const subject = text(meta['subject']);
      const status = text(meta['status']);
      if (!subject || !status) return fallback;
      return translate(`${DETAILS}ticketStatus`, {
        subject,
        status: translate(`admin.tickets.statuses.${status}`),
      });
    }

    case 'subscription_assigned': {
      const plan = text(meta['planName']);
      const months = num(meta['contractDuration']);
      if (!plan || months === null) return fallback;
      return translate(`${DETAILS}subscriptionAssigned`, { plan, months });
    }

    case 'subscription_canceled': {
      const date = formatDay(meta['accessUntil'], locale);
      return date ? translate(`${DETAILS}subscriptionCanceled`, { date }) : fallback;
    }

    case 'addon_sold': {
      const pkg = text(meta['packageName']);
      const price = money(meta['totalPrice']);
      if (!pkg || price === null) return fallback;
      return translate(`${DETAILS}addonSold`, { package: pkg, price });
    }

    case 'invoice_created': {
      const number = text(meta['invoiceNumber']);
      const total = money(meta['total']);
      if (!number || total === null) return fallback;
      return translate(`${DETAILS}invoiceCreated`, { number, total });
    }

    case 'invoice_marked_sent':
    case 'invoice_marked_paid':
      return text(meta['invoiceNumber']) ?? fallback;

    case 'phone_number_assigned':
    case 'phone_number_released':
      return text(meta['phoneNumber']) ?? fallback;

    case 'phone_number_imported': {
      const number = text(meta['phoneNumber']);
      const provider = text(meta['provider']);
      if (!number || !provider) return fallback;
      return translate(`${DETAILS}numberImported`, { number, provider });
    }

    case 'reseller_credits_purchased':
    case 'reseller_credits_deducted': {
      const minutes = num(meta['voiceMinutes']);
      // The service calls the same figure chatSessions when it is bought and
      // chatMessages when it is burned.
      const chats = num(meta['chatSessions'] ?? meta['chatMessages']);
      if (minutes === null || chats === null) return fallback;
      return translate(`${DETAILS}credits`, { minutes, chats });
    }

    case 'pricing_updated': {
      const chat = money(meta['chatSessionPrice']);
      const voice = money(meta['voiceMinutePrice']);
      if (chat === null || voice === null) return fallback;
      return translate(`${DETAILS}pricing`, { chat, voice });
    }

    default:
      return entry.action !== null && SELF_EXPLANATORY.has(entry.action) ? '' : fallback;
  }
}
