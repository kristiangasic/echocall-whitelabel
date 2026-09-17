/**
 * Everything the smoke run shares between the harness that starts the portal
 * and the tests that drive it: ports, URLs and the two seeded accounts.
 *
 * The values can be overridden through the environment so the run fits into a
 * pipeline that hands out its own database and ports.
 */

export const PORTAL_PORT = Number(process.env.SMOKE_PORTAL_PORT ?? 4010);
export const HUB_PORT = Number(process.env.SMOKE_HUB_PORT ?? 4011);

export const PORTAL_URL = `http://127.0.0.1:${PORTAL_PORT}`;

/** The service the portal talks to during the run: a stub, never the real one. */
export const HUB_URL = `http://127.0.0.1:${HUB_PORT}/api/v1`;

/** Answers 200 only once the portal is up and both accounts exist. */
export const READY_URL = `http://127.0.0.1:${HUB_PORT}/e2e/ready`;

/** PostgreSQL only: the run drops and recreates the schema of this database. */
export const DATABASE_URL =
  process.env.SMOKE_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5433/echocall_light_smoke';

/** The first administrator, created through the first-run setup. */
export const OPERATOR = {
  email: 'operator@portal.test',
  password: 'smoke-operator-2026',
  firstName: 'Ada',
};

/** A customer with a portal login, created by the operator and invited. */
export const CUSTOMER = {
  email: 'lena@customer.test',
  password: 'smoke-customer-2026',
  firstName: 'Lena',
  lastName: 'Brandt',
  company: 'Brandt Elektro',
};
