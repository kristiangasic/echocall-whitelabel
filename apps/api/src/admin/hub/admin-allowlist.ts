/**
 * The operator proxy forwards exactly these hub calls, nothing else. Every
 * entry runs in the portal operator's own context (no act-as header), so the
 * hub answers as the reseller behind the configured API key.
 *
 * Deliberately not on the list, and therefore 404 for the browser:
 * - POST /resellers/credits/purchase and POST /resellers/credits/deduct: buying
 *   and burning operator credit is a payment flow and stays in the hub.
 * - GET /resellers/billing/keys: would hand the operator's payment secrets to a
 *   browser session.
 * - POST /resellers/customers/{id}/credits: superseded by the balance endpoints,
 *   which write the same ledger with a proper reason.
 * - everything outside /resellers: the customer surfaces belong to the customer
 *   proxy, which scopes them to the signed-in customer.
 */

/** One path segment: hub ids are numeric or prefixed (agent_12), never contain a slash. */
const ID = String.raw`[A-Za-z0-9_-]+`;

/** methods, path template ({id} stands for one id segment) */
const RULES: readonly (readonly [string, string])[] = [
  ['GET', '/resellers/stats'],
  ['GET', '/resellers/balance'],
  ['GET', '/resellers/balance-status'],
  ['GET', '/resellers/credits/balance'],
  ['GET', '/resellers/credits/transactions'],

  ['GET|POST', '/resellers/customers'],
  ['GET|PATCH|DELETE', '/resellers/customers/{id}'],
  ['PATCH', '/resellers/customers/{id}/suspend'],
  ['PATCH', '/resellers/customers/{id}/unsuspend'],
  ['GET', '/resellers/customers/{id}/balance'],
  ['POST', '/resellers/customers/{id}/balance/add'],
  ['POST', '/resellers/customers/{id}/balance/subtract'],
  ['GET', '/resellers/customers/{id}/transactions'],
  ['GET', '/resellers/customers/{id}/subscriptions'],
  ['GET', '/resellers/customers/{id}/usage'],

  ['GET|POST', '/resellers/plans'],
  ['PATCH|DELETE', '/resellers/plans/{id}'],
  ['GET|PATCH', '/resellers/pricing'],
  ['GET', '/resellers/pricing/suggestions'],

  ['GET|POST', '/resellers/subscriptions'],
  ['GET', '/resellers/subscriptions/count'],
  ['POST', '/resellers/subscriptions/{id}/cancel'],
  ['POST', '/resellers/subscriptions/{id}/cancel-immediate'],

  ['GET', '/resellers/addons/packages'],
  ['GET', '/resellers/addons/purchases'],
  ['GET', '/resellers/addons/stats'],
  ['POST', '/resellers/addons/sell'],

  ['GET|POST', '/resellers/invoices'],
  ['GET', '/resellers/invoices/{id}'],
  ['POST', '/resellers/invoices/{id}/mark-sent'],
  ['POST', '/resellers/invoices/{id}/mark-paid'],

  ['GET', '/resellers/phone-numbers/available'],
  ['GET', '/resellers/phone-numbers/assigned'],
  ['POST', '/resellers/phone-numbers/import'],
  ['POST', '/resellers/phone-numbers/{id}/assign'],
  ['POST', '/resellers/phone-numbers/{id}/release'],

  ['GET', '/resellers/tickets'],
  ['GET|PATCH', '/resellers/tickets/{id}'],
  ['POST', '/resellers/tickets/{id}/reply'],
  ['POST', '/resellers/tickets/{id}/escalate'],

  ['GET', '/resellers/analytics/usage'],
  ['GET', '/resellers/analytics/revenue'],

  ['GET', '/resellers/settings'],
  ['PATCH', '/resellers/settings/company'],
  ['PATCH', '/resellers/settings/payment-keys'],
  ['GET|PATCH', '/resellers/settings/logo'],
  ['GET|PATCH', '/resellers/company'],

  ['GET', '/resellers/activity-log'],
  ['GET', '/resellers/voice-agents'],
  ['GET', '/resellers/chatbots'],
];

interface CompiledRule {
  methods: Set<string>;
  pattern: RegExp;
}

const COMPILED: CompiledRule[] = RULES.map(([methods, template]) => ({
  methods: new Set(methods.split('|')),
  pattern: new RegExp(`^${template.replaceAll('{id}', ID)}$`),
}));

/** True when the operator proxy may forward this call. The path must be the bare hub path without a query. */
export function matchOperatorCall(method: string, hubPath: string): boolean {
  if (hubPath.includes('..') || hubPath.includes('//') || !hubPath.startsWith('/')) return false;
  return COMPILED.some((rule) => rule.methods.has(method) && rule.pattern.test(hubPath));
}
