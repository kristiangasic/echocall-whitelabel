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
  firstName: 'Ada',
};

/** A customer with a portal login, created by the operator and invited. */
export const CUSTOMER = {
  email: 'lena@customer.test',
  firstName: 'Lena',
  lastName: 'Brandt',
  company: 'Brandt Elektro',
};

/**
 * The portal's own settings for the run. The tests need them too: nobody signs
 * in with a password any more, so a test reaches the same database as the
 * portal and asks it for a one-time link, exactly as an operator would on a
 * machine whose mail server is down.
 *
 * Only ever used against the throwaway database above, never an installation.
 */
export const APP_SECRET = 'smoke-secret-for-the-end-to-end-run-only';
export const API_KEY = `eck_test_${'a1b2c3d4'.repeat(8)}`;

/** What the portal and the sign-in link command both read from the environment. */
export const PORTAL_ENV = {
  APP_URL: PORTAL_URL,
  APP_SECRET,
  DATABASE_URL,
  DATABASE_SSL: 'disable',
  ECHOCALL_API_URL: HUB_URL,
  ECHOCALL_API_KEY: API_KEY,
};
