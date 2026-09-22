import { describe, expect, it } from 'vitest';
import { matchOperatorCall } from './admin-allowlist.js';

describe('matchOperatorCall', () => {
  it('accepts the reseller surfaces the admin panel is built on', () => {
    expect(matchOperatorCall('GET', '/resellers/stats')).toBe(true);
    expect(matchOperatorCall('GET', '/resellers/customers')).toBe(true);
    expect(matchOperatorCall('GET', '/resellers/customers/42')).toBe(true);
    expect(matchOperatorCall('POST', '/resellers/customers/42/balance/add')).toBe(true);
    expect(matchOperatorCall('GET', '/resellers/customers/42/transactions')).toBe(true);
    expect(matchOperatorCall('GET', '/resellers/plans')).toBe(true);
    expect(matchOperatorCall('PATCH', '/resellers/pricing')).toBe(true);
    expect(matchOperatorCall('GET', '/resellers/subscriptions/count')).toBe(true);
    expect(matchOperatorCall('POST', '/resellers/subscriptions/7/cancel-immediate')).toBe(true);
    expect(matchOperatorCall('POST', '/resellers/addons/sell')).toBe(true);
    expect(matchOperatorCall('POST', '/resellers/invoices/7/mark-paid')).toBe(true);
    expect(matchOperatorCall('POST', '/resellers/phone-numbers/7/assign')).toBe(true);
    expect(matchOperatorCall('DELETE', '/resellers/phone-numbers/7')).toBe(true);
    expect(matchOperatorCall('POST', '/resellers/tickets/7/escalate')).toBe(true);
    expect(matchOperatorCall('GET', '/resellers/analytics/revenue')).toBe(true);
    expect(matchOperatorCall('PATCH', '/resellers/settings/company')).toBe(true);
    expect(matchOperatorCall('GET', '/resellers/activity-log')).toBe(true);
    expect(matchOperatorCall('GET', '/resellers/voice-agents')).toBe(true);
  });

  it('accepts the language table the agent inventory is named from', () => {
    expect(matchOperatorCall('GET', '/languages/agent')).toBe(true);
    expect(matchOperatorCall('POST', '/languages/agent')).toBe(false);
    expect(matchOperatorCall('GET', '/languages')).toBe(false);
  });

  it('keeps payment flows and payment secrets out of the browser', () => {
    expect(matchOperatorCall('POST', '/resellers/credits/purchase')).toBe(false);
    expect(matchOperatorCall('POST', '/resellers/credits/deduct')).toBe(false);
    expect(matchOperatorCall('GET', '/resellers/billing/keys')).toBe(false);
    expect(matchOperatorCall('POST', '/resellers/customers/42/credits')).toBe(false);
  });

  it('keeps every write on a customer with the service that also owns the portal login', () => {
    expect(matchOperatorCall('POST', '/resellers/customers')).toBe(false);
    expect(matchOperatorCall('PATCH', '/resellers/customers/42')).toBe(false);
    expect(matchOperatorCall('DELETE', '/resellers/customers/42')).toBe(false);
    expect(matchOperatorCall('PATCH', '/resellers/customers/42/suspend')).toBe(false);
    expect(matchOperatorCall('PATCH', '/resellers/customers/42/unsuspend')).toBe(false);
  });

  it('refuses the customer surfaces, which the admin panel has no business in', () => {
    expect(matchOperatorCall('GET', '/agents')).toBe(false);
    expect(matchOperatorCall('GET', '/users/me')).toBe(false);
    expect(matchOperatorCall('POST', '/provisioning/create')).toBe(false);
    expect(matchOperatorCall('DELETE', '/resellers/stats')).toBe(false);
    expect(matchOperatorCall('GET', '/resellers')).toBe(false);
  });

  it('refuses path tricks', () => {
    expect(matchOperatorCall('GET', '/resellers/../agents')).toBe(false);
    expect(matchOperatorCall('GET', '//resellers/customers')).toBe(false);
    expect(matchOperatorCall('GET', 'resellers/customers')).toBe(false);
    expect(matchOperatorCall('GET', '/resellers/customers/1/2/3')).toBe(false);
  });
});
