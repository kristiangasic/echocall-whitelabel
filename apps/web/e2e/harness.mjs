/**
 * Starts everything one smoke run needs and keeps it alive until the run ends:
 * an empty PostgreSQL schema, the stub of the service, the portal serving the
 * built front end, and two seeded accounts.
 *
 * The portal is started with its API URL pointing at the stub, so a smoke run
 * never reaches a real service. The readiness URL of the stub only answers 200
 * once the seeding is done, which is what the test runner waits for.
 *
 * Run by the Playwright config; it can also be started by hand:
 *   node e2e/harness.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  CUSTOMER,
  DATABASE_URL,
  HUB_PORT,
  HUB_URL,
  OPERATOR,
  PORTAL_ENV,
  PORTAL_PORT,
  PORTAL_URL,
} from './accounts.mjs';
import { DEMO_CUSTOMERS, DEMO_SIGNED_IN } from './demo-data.mjs';
import { startHubStub } from './hub-stub.mjs';

/**
 * Demo mode seeds the invented customers of demo-data.mjs instead of the single
 * one a smoke run needs, and the stub answers with their balances. The
 * screenshot run turns it on; a test run never does.
 */
const DEMO = process.env.SMOKE_DEMO === '1';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const apiRoot = resolve(webRoot, '../api');
const apiEntry = resolve(apiRoot, 'dist/main.js');
const webDist = resolve(webRoot, 'dist/web/browser');

/** The header the portal requires on every mutating call instead of a token. */
const CSRF = { 'x-requested-with': 'XMLHttpRequest' };

function fail(message) {
  console.error(`Smoke harness: ${message}`);
  process.exit(1);
}

/**
 * Empties the database the run uses. PostgreSQL only, on purpose: the smoke run
 * checks the combination the project supports for an installation.
 */
async function resetDatabase() {
  const url = new URL(DATABASE_URL);
  if (!url.protocol.startsWith('postgres')) {
    fail(`SMOKE_DATABASE_URL must be a PostgreSQL URL, got ${url.protocol}`);
  }
  // pg is a dependency of the back end, so it is resolved from there.
  const apiRequire = createRequire(resolve(apiRoot, 'package.json'));
  const { Client } = apiRequire('pg');

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const maintenance = new URL(DATABASE_URL);
  maintenance.pathname = '/postgres';
  const admin = new Client({ connectionString: maintenance.toString() });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    // The name comes from the run's own configuration, never from a request.
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${database.replaceAll('"', '')}"`);
  } finally {
    await admin.end();
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}

/** Starts the portal with the built front end next to it. */
function startPortal() {
  const child = spawn(process.execPath, [apiEntry], {
    // Started outside both app folders so a local .env of a developer machine
    // cannot leak into the run.
    cwd: here,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORTAL_PORT),
      ...PORTAL_ENV,
      WEB_DIST_DIR: webDist,
      // No mail server: invitations are handed back as a link instead.
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      SMTP_FROM: '',
    },
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) fail(`the portal stopped with exit code ${code}`);
  });
  return child;
}

async function waitForPortal() {
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      const response = await fetch(`${PORTAL_URL}/healthz`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) fail('the portal did not answer on /healthz in time');
    await new Promise((done) => setTimeout(done, 300));
  }
}

/** One request to the portal that carries the session cookie and the CSRF header. */
async function call(path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${PORTAL_URL}/api${path}`, {
    method,
    headers: {
      ...CSRF,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    fail(`${method} ${path} answered ${response.status}: ${text}`);
  }
  const setCookie = response.headers.getSetCookie();
  return { body: parsed, cookie: setCookie.map((line) => line.split(';')[0]).join('; ') };
}

/**
 * Creates the first administrator through the first-run setup and, as that
 * administrator, one customer with a portal login whose invitation is accepted
 * right away. Everything goes through the portal's own API, so the seed cannot
 * drift away from what the portal itself does.
 */
/**
 * Marks demo customers as having a portal login already, without spending the
 * portal's authentication budget on invitations nobody is going to follow.
 * Demo mode only, against the throwaway database the run just created.
 */
async function markSignedIn(emails) {
  if (emails.length === 0) return;
  const apiRequire = createRequire(resolve(apiRoot, 'package.json'));
  const { Client } = apiRequire('pg');
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('UPDATE users SET status = $1 WHERE email = ANY($2)', ['active', emails]);
  } finally {
    await client.end();
  }
}

async function createCustomer(adminCookie, customer, { acceptInvite }) {
  const created = await call('/admin/customers', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      company: customer.company,
      language: customer.language ?? 'de',
      sendInvite: false,
    },
  });

  if (!acceptInvite) return;

  const token = new URL(created.body.inviteLink).searchParams.get('token');
  if (!token) fail('the invitation link carried no token');
  await call('/auth/accept-invite', {
    method: 'POST',
    body: { token, firstName: customer.firstName, lastName: customer.lastName },
  });
}

async function seed() {
  const admin = await call('/setup/admin', {
    method: 'POST',
    body: { email: OPERATOR.email, firstName: OPERATOR.firstName, language: DEMO ? 'en' : 'de' },
  });

  if (DEMO) {
    // Only the customer whose workspace the pictures show accepts an invitation
    // for real: the portal allows five authentication calls a minute and that
    // limit is worth keeping. The others are marked as having signed in once,
    // which is a state time would produce and nobody signs in as them.
    for (const customer of DEMO_CUSTOMERS) {
      await createCustomer(admin.cookie, customer, {
        acceptInvite: customer.email === DEMO_SIGNED_IN.email,
      });
    }
    await markSignedIn(DEMO_CUSTOMERS.filter((row) => row.acceptInvite === true).map((row) => row.email));
  } else {
    await createCustomer(admin.cookie, { ...CUSTOMER, language: 'de' }, { acceptInvite: true });
  }

  await call('/auth/logout', { method: 'POST', cookie: admin.cookie });
}

if (!existsSync(apiEntry)) fail(`${apiEntry} is missing. Build the portal first: npm run build`);
if (!existsSync(webDist)) fail(`${webDist} is missing. Build the portal first: npm run build`);

const stub = startHubStub(HUB_PORT, { demo: DEMO });
await stub.listen();
await resetDatabase();
const portal = startPortal();

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  portal.kill();
  await stub.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await waitForPortal();
await seed();
stub.markReady();
console.log(`Smoke harness ready: portal on ${PORTAL_URL}, service stub on ${HUB_URL}`);
