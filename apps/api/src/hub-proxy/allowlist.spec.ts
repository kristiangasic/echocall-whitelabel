import { describe, expect, it } from 'vitest';
import { matchCustomerCall } from './allowlist.js';

describe('matchCustomerCall', () => {
  it('accepts the customer surfaces of the hub', () => {
    expect(matchCustomerCall('GET', '/agents')).toBe(true);
    expect(matchCustomerCall('POST', '/agents')).toBe(true);
    expect(matchCustomerCall('PATCH', '/agents/agent_12')).toBe(true);
    expect(matchCustomerCall('POST', '/agents/12/knowledge/7/refresh')).toBe(true);
    expect(matchCustomerCall('GET', '/conversations')).toBe(true);
    expect(matchCustomerCall('POST', '/conversations/9/messages')).toBe(true);
    expect(matchCustomerCall('PATCH', '/notifications/read-all')).toBe(true);
    expect(matchCustomerCall('GET', '/billing/invoices')).toBe(true);
    expect(matchCustomerCall('DELETE', '/webhooks/3')).toBe(true);
  });

  it('refuses everything not listed', () => {
    expect(matchCustomerCall('GET', '/resellers/customers')).toBe(false);
    expect(matchCustomerCall('POST', '/provisioning/create')).toBe(false);
    expect(matchCustomerCall('GET', '/users/me')).toBe(false);
    expect(matchCustomerCall('POST', '/billing/plans/3/checkout')).toBe(false);
    expect(matchCustomerCall('GET', '/billing/invoices/9/pdf')).toBe(false);
    expect(matchCustomerCall('DELETE', '/agents')).toBe(false);
    expect(matchCustomerCall('GET', '/health')).toBe(false);
  });

  it('refuses path tricks', () => {
    expect(matchCustomerCall('GET', '/agents/../resellers/customers')).toBe(false);
    expect(matchCustomerCall('GET', '//agents')).toBe(false);
    expect(matchCustomerCall('GET', 'agents')).toBe(false);
    expect(matchCustomerCall('GET', '/agents/1/2/3')).toBe(false);
  });
});
