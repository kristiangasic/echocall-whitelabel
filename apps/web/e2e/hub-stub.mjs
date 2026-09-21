/**
 * A stand-in for the service the portal is built on, for the smoke run only.
 *
 * It answers the handful of calls the two smoke paths make and keeps what it
 * was given in memory, so a customer the operator creates shows up in the list
 * afterwards. The real service is never reached during a test run: the portal
 * is started with its API URL pointing here.
 */
import { createServer } from 'node:http';
import {
  DEMO_AGENTS,
  DEMO_CONVERSATIONS,
  DEMO_CUSTOMERS,
  DEMO_LIMITS,
  DEMO_RESELLER_BALANCE,
  DEMO_RESELLER_CREDITS,
  DEMO_RESELLER_STATS,
  DEMO_RESELLER_TICKETS,
  DEMO_SUBSCRIPTION_COUNT,
  DEMO_USAGE,
} from './demo-data.mjs';

const PREFIX = '/api/v1';

/** The account behind the API key: the operator of the portal. */
const OPERATOR_PROFILE = {
  id: 77,
  email: 'operator@example.test',
  name: 'Portal Operator',
  role: 'reseller',
  avatarUrl: null,
  defaultLanguage: 'de',
  resellerId: null,
  ownResellerId: 9,
};

const RECENT_CONVERSATION = {
  type: 'voice',
  id: 31,
  direction: 'inbound',
  fromNumber: '+4930111111',
  toNumber: '+4930222222',
  status: 'completed',
  createdAt: '2026-09-17T08:00:00.000Z',
};

function page(data, extra = {}) {
  return { data, pagination: { page: 1, perPage: 25, total: data.length, ...extra } };
}

function notFound(method, path) {
  return {
    status: 404,
    body: { error: { code: 'not_found', message: `The stub has no route for ${method} ${path}` } },
  };
}

/**
 * Keeps the state of one run: customers and support requests.
 *
 * In demo mode the stub additionally knows a balance and a usage figure for
 * each invented customer, so the screenshot run shows a portal that is in use
 * rather than one that was installed a minute ago. A smoke run never turns it
 * on and sees the same fixed numbers it always did.
 */
function createState(demo) {
  const profiles = new Map(demo ? DEMO_CUSTOMERS.map((row) => [row.email, row]) : []);
  return { customers: [], tickets: [], nextCustomerId: 5001, nextTicketId: 1, demo, profiles };
}

function customerRow(customer, profile) {
  return {
    id: customer.id,
    resellerId: 9,
    userId: customer.id,
    customerReference: null,
    notes: null,
    createdAt: profile?.createdAt ?? customer.createdAt,
    user: {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      company: customer.company,
      balanceEur: profile?.balanceEur ?? '25.00',
      voiceMinutes: profile?.voiceMinutes ?? 58,
      chatConversations: profile?.chatConversations ?? 40,
      accountStatus: profile?.accountStatus ?? 'active',
      createdAt: profile?.createdAt ?? customer.createdAt,
    },
  };
}

function ticketSummary(ticket) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    category: ticket.category,
    priority: ticket.priority,
    updatedAt: ticket.createdAt,
  };
}

/**
 * Answers one call. The path is the part behind /api/v1, without the query;
 * customerId is the account the portal acts as, which is unset for the
 * operator's own calls. Only the conversation list reads the query.
 */
function route(state, method, path, body, customerId, query) {
  const customer = state.customers.find((row) => row.id === customerId) ?? null;

  if (method === 'GET' && path === '/users/me') {
    if (customer === null) return { status: 200, body: OPERATOR_PROFILE };
    return {
      status: 200,
      body: {
        id: customer.id,
        email: customer.email,
        name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email,
        role: 'customer',
        avatarUrl: null,
        defaultLanguage: customer.language,
        resellerId: 9,
        ownResellerId: null,
      },
    };
  }

  if (method === 'GET' && path === '/users/me/usage') {
    if (state.demo) return { status: 200, body: DEMO_USAGE };
    return {
      status: 200,
      body: {
        period: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z' },
        voiceMinutesUsed: 42,
        chatSessionsUsed: 8,
      },
    };
  }

  if (method === 'GET' && path === '/users/me/limits') {
    if (state.demo) return { status: 200, body: DEMO_LIMITS };
    return {
      status: 200,
      body: {
        accountStatus: 'active',
        balanceEur: 25,
        voiceMinutesRemaining: 58,
        plan: { name: 'Business', voiceMinutesPerMonth: 100 },
      },
    };
  }

  if (method === 'GET' && path === '/resellers/customers') {
    const rows = state.customers.map((row) => customerRow(row, state.profiles.get(row.email) ?? null));
    return { status: 200, body: page(rows) };
  }

  if (method === 'POST' && path === '/resellers/customers') {
    const created = {
      id: state.nextCustomerId++,
      email: String(body?.email ?? ''),
      firstName: body?.firstName ?? null,
      lastName: body?.lastName ?? null,
      company: body?.company ?? null,
      language: body?.language ?? 'de',
      createdAt: new Date().toISOString(),
    };
    state.customers.push(created);
    return { status: 201, body: { userId: created.id, email: created.email } };
  }

  if (method === 'GET' && path === '/conversations') {
    // The portal asks for calls and chats separately, as the service does.
    const type = query.get('type');
    const rows = state.demo ? DEMO_CONVERSATIONS : [RECENT_CONVERSATION];
    return { status: 200, body: page(type ? rows.filter((row) => row.type === type) : rows) };
  }

  if (method === 'GET' && path === '/agents' && state.demo) {
    return { status: 200, body: page(DEMO_AGENTS) };
  }

  // The operator's own figures, one tile of the overview each.
  if (method === 'GET' && state.demo) {
    if (path === '/resellers/stats') return { status: 200, body: DEMO_RESELLER_STATS };
    if (path === '/resellers/credits/balance') return { status: 200, body: DEMO_RESELLER_CREDITS };
    if (path === '/resellers/balance') return { status: 200, body: DEMO_RESELLER_BALANCE };
    if (path === '/resellers/subscriptions/count') return { status: 200, body: DEMO_SUBSCRIPTION_COUNT };
    if (path === '/resellers/tickets') return { status: 200, body: page(DEMO_RESELLER_TICKETS) };
  }

  if (method === 'GET' && path === '/tickets') {
    const mine = state.tickets.filter((ticket) => ticket.customerId === customerId);
    return { status: 200, body: page(mine.map(ticketSummary)) };
  }

  if (method === 'POST' && path === '/tickets') {
    const ticket = {
      id: `ticket_${state.nextTicketId++}`,
      customerId,
      subject: String(body?.subject ?? ''),
      description: String(body?.description ?? ''),
      category: body?.category ?? 'technical',
      priority: body?.priority ?? 'medium',
      status: 'open',
      createdAt: new Date().toISOString(),
      messages: [],
    };
    state.tickets.push(ticket);
    return { status: 201, body: { id: ticket.id } };
  }

  const ticketDetail = /^\/tickets\/([A-Za-z0-9_-]+)$/.exec(path);
  if (method === 'GET' && ticketDetail) {
    const ticket = state.tickets.find((row) => row.id === ticketDetail[1]);
    if (!ticket) return notFound(method, path);
    return { status: 200, body: ticket };
  }

  // Everything else a page asks for on the way is an empty collection, so the
  // portal renders without the stub having to know each surface.
  if (method === 'GET') return { status: 200, body: page([]) };
  return notFound(method, path);
}

/**
 * Starts the stub. Besides the service routes it serves /e2e/ready, which the
 * test runner waits for: it answers 200 only after the harness has seeded the
 * portal, so no test starts against a half-built database.
 */
export function startHubStub(port, { demo = false } = {}) {
  const state = createState(demo);
  let ready = false;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://internal');

    if (url.pathname === '/e2e/ready') {
      res.writeHead(ready ? 200 : 503, { 'content-type': 'text/plain' });
      res.end(ready ? 'ready' : 'starting');
      return;
    }

    if (!url.pathname.startsWith(PREFIX)) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'not_found', message: 'Not a service path' } }));
      return;
    }

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
      const header = req.headers['x-echocall-customer'];
      const customerId = typeof header === 'string' ? Number(header) : undefined;
      const answer = route(
        state,
        req.method ?? 'GET',
        url.pathname.slice(PREFIX.length),
        body,
        customerId,
        url.searchParams,
      );
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.body ?? {}));
    });
  });

  return {
    state,
    listen: () =>
      new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve(undefined));
      }),
    markReady: () => {
      ready = true;
    },
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve(undefined));
      }),
  };
}
