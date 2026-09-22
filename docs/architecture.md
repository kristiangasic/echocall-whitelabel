# Architecture

## Big picture

```
Browser (Angular)  ──cookies──▶  apps/api (NestJS)  ──Bearer eck_live_...──▶  EchoCall public API
                                     │
                                     ▼
                          Your database (PostgreSQL / MariaDB / MySQL)
```

The portal is a classic backend-for-frontend. The Angular app talks only to `apps/api`
under `/api`; the API resolves the session, applies roles, and calls the EchoCall public
API with the operator's reseller key. The key and all EchoCall responses stay server-side;
the browser receives only what the portal chooses to expose.

The portal's own database holds exactly four concerns: **accounts** (admins and users),
**sessions and one-time tokens**, **settings** (branding, SMTP), and the **audit log**.
Usage, limits, balance and plan data are never stored - they are fetched live per request.

## Back end (`apps/api`)

NestJS 12, ESM, Express. Modules:

| Module           | Responsibility                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `config`         | Loads and validates the environment once at startup (zod); fails fast                            |
| `db`             | Kysely with a PostgreSQL or MySQL dialect picked from `DATABASE_URL`; runs migrations on startup |
| `echocall`       | Typed client factory for the EchoCall API plus a cached hub status (periodic re-check)           |
| `auth`           | Sessions (httpOnly cookie), CSRF guard, roles guard, login rate limiting                         |
| `setup`          | First-run: connection check and creation of the initial admin                                    |
| `admin/*`        | Overview, user management (invite, edit, disable, delete), customers, impersonation              |
| `admin/hub`      | Forwards allow-listed operator calls to the EchoCall API under `/api/admin/hub`                  |
| `admin/invoices` | Streams the PDF of an invoice the operator raised, fetched from the EchoCall API                 |
| `settings`       | Branding (name, logo, color, legal links, default language) and SMTP                             |
| `account`        | Own profile, the customer usage overview and invoice downloads                                   |
| `hub-proxy`      | Forwards allow-listed customer calls to the EchoCall API under `/api/hub`                        |
| `embed`          | Re-serves the chat widget from the portal's own domain under `/embed`                            |
| `audit`          | Append-only log of admin actions with actor, IP and outcome                                      |
| `mail`           | Invitation and sign-in link mails via SMTP; falls back to one-time links                         |
| `health`         | `/healthz` (liveness) and `/readyz` (database + hub) for orchestration                           |

Cross-cutting rules:

- Guards are global: every route requires a session unless marked `@Public()`;
  mutating routes additionally require the `X-Requested-With` header (CSRF).
- Errors are always `{ error: { code, message, fieldErrors? } }` with stable codes;
  the front end translates codes, never messages.
- Upstream failures map to stable codes too (`no_active_subscription`,
  `invalid_api_key`, `upstream_unavailable`), so operators see what to fix.

## The hub proxy (`/api/hub`)

Workspace pages read and write far more hub resources than the portal could sensibly
mirror: agents, chatbots, numbers, conversations, analytics, integrations, webhooks,
campaigns, support requests and notifications. Wrapping each of them in a hand-written
controller would mean re-describing shapes the published API already documents, and every
upstream addition would need a second implementation here.

So the portal forwards them instead. `/api/hub/<hub path>` passes the call through with
the status and body of the upstream response untouched, which is why the front end can be
typed straight from the OpenAPI document. Three rules keep that from becoming a hole:

- **An allow list, not a pass-through.** `hub-proxy/allowlist.ts` names every method and
  path template that may be forwarded. Anything else answers 404, including the reseller,
  provisioning and payment surfaces the operator's key could otherwise reach.
- **Always in the customer's context.** Every forwarded call carries the act-as header for
  the signed-in user's linked customer, so the hub scopes it to that customer. A user
  cannot reach another customer's data even on an allow-listed path.
- **The key never leaves the server.** The browser authenticates with its session cookie;
  the reseller key is attached by the API.

Anything that is not a plain forward stays in its own controller: the account module, for
instance, fetches an invoice PDF from the hub and streams the bytes, because the hub's own
download link is readable only by a hub browser session. The operator's own invoices work
the same way in `admin/invoices`, and both controllers rewrite the filename they hand to
the browser unless the hub's own is plainly a filename.

## The operator proxy (`/api/admin/hub`)

The admin panel needs the other half of the hub: the reseller surfaces that describe the
operator's own business - customers, balances, plans, pricing, subscriptions, add-ons,
invoices, phone numbers, tickets, analytics, the agent inventory, the company profile and
the activity log. The same reasoning as for the customer proxy applies, so the shape is
the same, with two differences that matter.

- **Its own allow list.** `admin/hub/admin-allowlist.ts` names every method and path
  template an operator session may forward, and the file records why each omission is an
  omission. Payment secrets (`GET /resellers/billing/keys`), the credit purchase and
  deduction flows, and every raw write on a customer stay off it. A customer write has to
  change the hub account and the portal login in one go, which is what `/api/admin/customers`
  does; forwarding the raw call would let the browser create a customer nobody can sign in
  as, or delete one whose portal login still works.
- **In the operator's own context.** These calls carry no act-as header, so the hub answers
  as the reseller behind the configured key. The guard is the admin role: a user session on
  an operator path is 403, and an operator session on a path outside the list is 404.

The proxy does **not** rename the service in what it returns. Customer-facing texts are the
operator's brand throughout, but the operator holds the contract with EchoCall and has to
read its real name - when escalating a ticket, reading an invoice from the service, or
checking what the activity log recorded. Vendor neutrality is a separate rule and is
unaffected: the hub never names the AI provider behind voice and chat.

## Impersonation

An operator can open the portal as one of their customers to see exactly what that customer
sees. The session cookie the browser already holds is handed over to the customer account
and remembers who opened it, so no guard, proxy call or workspace page has to know about a
second identity: everything runs in the customer's context, and only the way back reads the
remembered operator id. The session carries the customer's role while it lasts, which is
what keeps the administration out of reach.

It refuses more than it allows:

- a customer without a portal login (`no_portal_login`) - there is no session to hand over;
- an administrator account (`cannot_impersonate_admin`) - this is not a way to become
  another operator;
- a login that has not been used yet or is disabled (`login_not_active`);
- a profile change while impersonating, and every `/admin` route, both by role;
- a session whose operator account is gone by the time it is handed back - the session ends
  and the browser has to sign in again (`session_ended`).

Start and end are both written to the audit log with the operator, the customer and the IP,
so a look at someone else's workspace is never invisible.

## The widget proxy (`/embed`)

Customer sites embed `<script src="{your portal}/embed/chat.js">`. The portal fetches the
widget files from `ECHOCALL_WIDGET_URL`, caches them for a few minutes, rewrites the asset
references in `widget.html` to point back at `/embed/assets/`, and serves everything from
the operator's own domain. Visitors of a customer's website therefore never resolve an
upstream host, and a brief outage of the widget origin is covered by the cached copy.

## Front end (`apps/web`)

Angular (standalone components, zoneless, signals) with Angular Material and Transloco
(EN/DE/FR). The shell lazy-loads one route chunk per page. Branding is applied at runtime:
the API serves the operator's name, logo and color, and the theme is re-tinted from that
color - no rebuild needed. Test infrastructure is Vitest with jsdom.

## How it is tested

Three layers, all runnable on a developer machine.

| Layer           | Command                | What it covers                                                                           |
| --------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| Back end        | `npm test -w apps/api` | Every route through supertest against a real database schema the suite creates and drops |
| Front end       | `npm test -w apps/web` | Components, services, guards and form logic with Vitest and jsdom                        |
| Browser (smoke) | `npm run e2e`          | The built portal, driven through Chromium on a desktop window and a phone viewport       |

The smoke run lives in `apps/web/e2e`. `harness.mjs` drops and recreates the schema of a
throwaway PostgreSQL database, starts `hub-stub.mjs` (a stand-in for the EchoCall API that
answers the calls the two paths make and keeps what it is given in memory), then starts the
built back end with `ECHOCALL_API_URL` pointing at the stub and `WEB_DIST_DIR` pointing at
the built front end. A real service is therefore never reached and no API key is needed.

Seeding goes through the portal's own API - the first-run setup creates the administrator,
the administrator creates a customer, the invitation is accepted - so the fixture cannot
drift away from what the portal actually does. The stub answers its readiness URL with 200
only once that is finished, which is what the test runner waits for. Both projects
(`desktop`, `phone`) run the same paths, because the portal has to work on a phone just as
well.

## API client (`packages/echocall-api`)

Generated from the published EchoCall OpenAPI document (`openapi-typescript` +
`openapi-fetch`). Regenerate with `npm run refresh-spec && npm run generate -w
packages/echocall-api` when the upstream API gains endpoints. `refresh-spec` compares the
download against the document in `spec/` and refuses one that has fewer paths, so a
service answering that path from an outdated file cannot quietly shrink the client;
`ECHOCALL_OPENAPI_URL` points it elsewhere and `ECHOCALL_ALLOW_SPEC_DOWNGRADE=1` writes it
anyway.

## Key decisions

- **One key, two audiences.** Admins operate the portal; users are linked to EchoCall
  customer accounts under the reseller. Customer-scoped calls send the act-as header for
  the linked customer; the key itself is never scoped down, so it must be protected.
- **Sessions over JWTs.** Server-side sessions can be revoked instantly (user disabled or
  deleted), which matters more here than statelessness.
- **Multi-database via Kysely.** One query builder, two dialects (postgres, mysql), the
  same migrations. PostgreSQL is the reference database; MariaDB/MySQL are covered by the
  same test suite in CI.
- **Forward what is documented, wrap what is not.** The allow-listed proxy keeps the
  portal small and in step with the upstream API; a resource only gets its own endpoint
  when the portal has to do something the browser cannot, such as fetching a PDF with the
  operator's key.
- **The operator reads real names, the customer never does.** White-label rules apply to
  everything a customer can see; the admin panel deliberately shows the service under its
  own name, because the operator is its customer.
- **White label enforced by CI.** `npm run check` fails the build when customer-facing
  texts or bundles leak the EchoCall brand or any upstream vendor name.
