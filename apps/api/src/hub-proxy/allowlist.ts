/**
 * The customer proxy forwards exactly these hub calls, nothing else. Every
 * entry runs in the signed-in customer's own context (act-as header), so the
 * hub scopes each call to that customer; the list only has to keep reseller,
 * provisioning and payment surfaces out of reach.
 */

export type ProxyMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** One path segment: hub ids are numeric or prefixed (agent_12), never contain a slash. */
const ID = String.raw`[A-Za-z0-9_-]+`;

/** methods, path template ({id} stands for one id segment) */
const RULES: readonly (readonly [string, string])[] = [
  ['GET|POST', '/agents'],
  ['GET|PATCH|DELETE', '/agents/{id}'],
  ['GET|POST', '/agents/{id}/knowledge'],
  ['DELETE', '/agents/{id}/knowledge/{id}'],
  ['POST', '/agents/{id}/knowledge/{id}/refresh'],
  ['GET|POST', '/agents/{id}/integrations'],
  ['PATCH|DELETE', '/agents/{id}/integrations/{id}'],
  ['GET|POST', '/chatbots'],
  ['GET|PATCH|DELETE', '/chatbots/{id}'],
  ['GET|POST', '/chatbots/{id}/knowledge'],
  ['DELETE', '/chatbots/{id}/knowledge/{id}'],
  ['POST', '/chatbots/{id}/knowledge/{id}/refresh'],
  ['GET|POST', '/chatbots/{id}/integrations'],
  ['PATCH|DELETE', '/chatbots/{id}/integrations/{id}'],
  ['GET', '/voices'],
  ['GET', '/voices/available'],
  ['GET', '/languages'],
  ['GET', '/languages/agent'],
  ['GET', '/phone-numbers'],
  ['GET', '/phone-numbers/countries'],
  ['GET', '/phone-numbers/search'],
  ['POST', '/phone-numbers/purchase'],
  ['GET|PATCH|DELETE', '/phone-numbers/{id}'],
  ['GET|POST', '/phone-numbers/{id}/kyc'],
  ['GET', '/phone-numbers/{id}/kyc/status'],
  ['GET', '/conversations'],
  ['GET|PATCH', '/conversations/{id}'],
  ['POST', '/conversations/{id}/close'],
  ['GET|POST', '/conversations/{id}/messages'],
  ['GET', '/analytics/summary'],
  ['GET', '/analytics/daily'],
  ['GET', '/analytics/agents/{id}'],
  ['GET', '/analytics/chatbots/{id}'],
  ['GET|POST', '/integrations'],
  ['GET', '/integrations/types'],
  ['GET|PATCH|DELETE', '/integrations/{id}'],
  ['POST', '/integrations/{id}/test'],
  ['GET', '/integrations/{id}/tools'],
  ['GET|POST', '/webhooks'],
  ['GET', '/webhooks/events'],
  ['GET|PATCH|DELETE', '/webhooks/{id}'],
  ['POST', '/webhooks/{id}/test'],
  ['GET|POST', '/batch-calling/campaigns'],
  ['GET|DELETE', '/batch-calling/campaigns/{id}'],
  ['POST', '/batch-calling/campaigns/{id}/cancel'],
  ['POST', '/batch-calling/campaigns/{id}/submit'],
  ['GET', '/batch-calling/campaigns/{id}/recipients'],
  ['GET|POST', '/tickets'],
  ['GET', '/tickets/{id}'],
  ['POST', '/tickets/{id}/messages'],
  ['GET', '/notifications'],
  ['PATCH', '/notifications/{id}/read'],
  ['PATCH', '/notifications/read-all'],
  ['GET', '/billing/balance'],
  ['GET', '/billing/transactions'],
  ['GET', '/billing/invoices'],
  ['GET', '/billing/subscription'],
  ['GET', '/billing/plans'],
  ['GET', '/billing/addons'],
];

interface CompiledRule {
  methods: Set<string>;
  pattern: RegExp;
}

const COMPILED: CompiledRule[] = RULES.map(([methods, template]) => ({
  methods: new Set(methods.split('|')),
  pattern: new RegExp(`^${template.replaceAll('{id}', ID)}$`),
}));

/** True when the proxy may forward this call. The path must be the bare hub path without a query. */
export function matchCustomerCall(method: string, hubPath: string): boolean {
  if (hubPath.includes('..') || hubPath.includes('//') || !hubPath.startsWith('/')) return false;
  return COMPILED.some((rule) => rule.methods.has(method) && rule.pattern.test(hubPath));
}
