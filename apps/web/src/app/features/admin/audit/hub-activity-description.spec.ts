import { hubActivityDescription } from './hub-activity-description';

/**
 * Records which key and which values the wording asked for, so a case can
 * assert the sentence the portal builds without restating the translation.
 */
const translate = (key: string, params?: Record<string, unknown>): string =>
  params ? `${key} ${JSON.stringify(params)}` : key;

const describeEntry = (action: string, metadata: unknown, description: string | null = 'English sentence') =>
  hubActivityDescription({ action, description, metadata }, translate, 'de');

describe('hubActivityDescription', () => {
  it('names the customer behind a creation', () => {
    expect(describeEntry('customer_created', { email: 'lena@example.test' })).toBe('lena@example.test');
  });

  it('says nothing where the action already says everything', () => {
    // "Updated customer: 141467" repeats the target column in English. The
    // action name plus the target is the whole entry, so the column stays empty.
    for (const action of [
      'customer_updated',
      'customer_deleted',
      'customer_suspended',
      'customer_unsuspended',
      'payment_keys_updated',
      'company_data_updated',
      'company_profile_updated',
      'logo_updated',
      'subscription_canceled_immediate',
    ]) {
      expect(describeEntry(action, null), action).toBe('');
    }
  });

  it('shows the reason an operator typed for a balance move', () => {
    expect(
      describeEntry('customer_balance_adjusted', { amount: 5, newBalance: 12, reason: 'Gutschrift' }),
    ).toBe('Gutschrift');
  });

  it('words a balance move that carries no reason, in both directions', () => {
    expect(describeEntry('customer_balance_adjusted', { amount: 5, newBalance: 12, reason: null })).toBe(
      'admin.audit.hub.details.balanceAdded {"amount":"5,00 €","balance":"12,00 €"}',
    );
    expect(describeEntry('customer_balance_adjusted', { amount: -5, newBalance: 7, reason: null })).toBe(
      'admin.audit.hub.details.balanceSubtracted {"amount":"5,00 €","balance":"7,00 €"}',
    );
  });

  it('names the plan behind a plan change', () => {
    for (const action of ['plan_created', 'plan_updated', 'plan_deleted']) {
      expect(describeEntry(action, { name: 'Praxis Basis' }), action).toBe('Praxis Basis');
    }
  });

  it('names the ticket, and marks a reply the customer never saw', () => {
    expect(describeEntry('ticket_replied', { subject: 'Rufnummer fehlt', isInternal: false })).toBe(
      'Rufnummer fehlt',
    );
    expect(describeEntry('ticket_replied', { subject: 'Rufnummer fehlt', isInternal: true })).toBe(
      'admin.audit.hub.details.internalNote {"subject":"Rufnummer fehlt"}',
    );
    expect(describeEntry('ticket_escalated', { subject: 'Rufnummer fehlt' })).toBe('Rufnummer fehlt');
  });

  it('translates the ticket status instead of repeating the service keyword', () => {
    expect(describeEntry('ticket_status_updated', { subject: 'Rufnummer fehlt', status: 'resolved' })).toBe(
      'admin.audit.hub.details.ticketStatus {"subject":"Rufnummer fehlt","status":"admin.tickets.statuses.resolved"}',
    );
  });

  it('words a subscription with its plan and its term', () => {
    expect(
      describeEntry('subscription_assigned', { planId: 5, planName: 'Praxis Basis', contractDuration: 12 }),
    ).toBe('admin.audit.hub.details.subscriptionAssigned {"plan":"Praxis Basis","months":12}');
  });

  it('gives a cancellation the date the access really ends', () => {
    expect(describeEntry('subscription_canceled', { subscriptionId: 3, accessUntil: '2026-10-17' })).toBe(
      'admin.audit.hub.details.subscriptionCanceled {"date":"17.10.2026"}',
    );
  });

  it('words a sale, an invoice and a number with their own figures', () => {
    expect(
      describeEntry('addon_sold', { packageName: '100 Minuten', totalPrice: 19, paymentMethod: 'balance' }),
    ).toBe('admin.audit.hub.details.addonSold {"package":"100 Minuten","price":"19,00 €"}');
    expect(describeEntry('invoice_created', { invoiceNumber: 'R73-0001', total: 58.31 })).toBe(
      'admin.audit.hub.details.invoiceCreated {"number":"R73-0001","total":"58,31 €"}',
    );
    expect(describeEntry('invoice_marked_paid', { invoiceNumber: 'R73-0001' })).toBe('R73-0001');
    expect(describeEntry('phone_number_assigned', { phoneNumber: '+49301234567' })).toBe('+49301234567');
    expect(describeEntry('phone_number_imported', { phoneNumber: '+49301234567', provider: 'twilio' })).toBe(
      'admin.audit.hub.details.numberImported {"number":"+49301234567","provider":"twilio"}',
    );
  });

  it('words the two credit movements and a price change', () => {
    expect(describeEntry('reseller_credits_purchased', { voiceMinutes: 100, chatSessions: 50 })).toBe(
      'admin.audit.hub.details.credits {"minutes":100,"chats":50}',
    );
    expect(describeEntry('reseller_credits_deducted', { voiceMinutes: 10, chatMessages: 5 })).toBe(
      'admin.audit.hub.details.credits {"minutes":10,"chats":5}',
    );
    expect(describeEntry('pricing_updated', { chatSessionPrice: 0.3, voiceMinutePrice: 0.25 })).toBe(
      'admin.audit.hub.details.pricing {"chat":"0,30 €","voice":"0,25 €"}',
    );
  });

  it('reads metadata the service sent as a JSON string', () => {
    expect(describeEntry('plan_deleted', '{"name":"Praxis Basis"}')).toBe('Praxis Basis');
  });

  // Entries written before the service carried structured data have no
  // metadata at all. Showing the English sentence beats showing nothing.
  it('falls back to what the service wrote when the data it needs is missing', () => {
    expect(describeEntry('subscription_canceled', null, 'Subscription #3 canceled')).toBe(
      'Subscription #3 canceled',
    );
    expect(describeEntry('plan_created', {}, 'Praxis Basis (49 EUR, monthly)')).toBe(
      'Praxis Basis (49 EUR, monthly)',
    );
    expect(describeEntry('invoice_created', 'not json', 'R73-0001 (58.31 EUR)')).toBe('R73-0001 (58.31 EUR)');
  });

  it('falls back for an action it has never seen', () => {
    expect(describeEntry('something_new', { any: 1 }, 'Whatever the service wrote')).toBe(
      'Whatever the service wrote',
    );
    expect(describeEntry('something_new', null, null)).toBe('');
  });
});
