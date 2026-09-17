# EchoCall Light

A self-hosted, white-label customer portal and admin panel that runs entirely on the
[EchoCall](https://echocall.de) public API. You run it under your own brand and domain,
invite your own customers, and every AI feature your customers use is served by the
EchoCall platform through a single reseller API key. Your customers never see EchoCall:
name, logo, colors and legal links all come from your branding settings.

**Who it is for:** agencies and resellers with an active EchoCall subscription who want to
offer voice and chat agents to their own customers under their own brand, without building
a portal from scratch.

## How it works

- You (the operator) sign in to the **admin panel** and run the business there: customers
  (create an EchoCall account and its portal login in one step, top up and withdraw
  balance, read transactions and usage), plans and pricing, subscriptions, add-ons,
  invoices, phone numbers, support tickets, revenue and cost analytics, the agents your
  customers built, your own company data and payment keys, plus portal branding, mail
  settings and the audit log.
- Your customers sign in to the **customer portal**: voice agents and chatbots, phone
  numbers, conversations with transcripts, analytics, knowledge base, integrations,
  campaigns and support requests, next to usage, balance, plan and invoices.
- You can **open the portal as one of your customers** to see what they see. The session
  carries the customer's role while it lasts, so the administration stays out of reach, and
  both the start and the end are written to your audit log.
- The portal keeps only accounts, sessions, settings and the audit log in **your own
  database**. Everything else is fetched live from the EchoCall API with your reseller key,
  which never leaves the server.

## Requirements

- An EchoCall reseller account with an active subscription and an API key
  (`eck_live_...`) - get one at [echocall.de](https://echocall.de)
- Docker (recommended), or Node.js 22.22.3+ with npm 12 for a manual install
- Optional: your own PostgreSQL 14+, MariaDB 10.6+ or MySQL 8 server
  (the Docker Compose setup ships a PostgreSQL container)

## Quick start with Docker Compose

```bash
git clone https://github.com/echocall/echocall-light.git
cd echocall-light
cp .env.example .env
# Edit .env: set APP_URL, APP_SECRET, ECHOCALL_API_KEY and DB_PASSWORD
docker compose -f docker/docker-compose.yml up -d
```

Open the app (port 3000, put a TLS-terminating reverse proxy in front for production) and
follow the first-run setup: it checks the connection to EchoCall and creates your admin
account. See [docs/self-hosting.md](docs/self-hosting.md) for reverse proxy examples,
updates and backups, and [docs/operating.md](docs/operating.md) for everything after that:
the first hour, what to watch, a rotated API key, a lost second factor, a lost
administrator password, backup and restore, upgrades.

## Using an external database

Point `DATABASE_URL` at your own server instead of the bundled container:

```
DATABASE_URL=postgres://light:secret@db.example.com:5432/echocall_light
DATABASE_URL=mariadb://light:secret@db.example.com:3306/echocall_light
```

The schema is created and migrated automatically at startup. Details and backup notes:
[docs/database.md](docs/database.md).

## Configuration

All settings are environment variables, documented one by one in
[docs/configuration.md](docs/configuration.md) and in [.env.example](.env.example).
The three you must set: `APP_URL`, `APP_SECRET`, `ECHOCALL_API_KEY`.

## Roles

| Role      | Sees                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **admin** | The admin panel: customers, plans and pricing, subscriptions, add-ons, invoices, numbers, tickets, analytics, agents, settings, audit log, own account |
| **user**  | The workspace of the linked EchoCall customer account, and their own account                                                                           |

Admins invite users by email (or hand over a one-time link when no SMTP server is
configured) and link each user to one of the EchoCall customer accounts under your
reseller account.

## Security

- Sessions are server-side, in httpOnly cookies; mutating requests require a
  CSRF header. Passwords are hashed with Argon2id.
- The reseller API key stays in the server environment; the browser never receives it.
- Login and token endpoints are rate limited; a strict Content-Security-Policy is set.
- Every sign-in, refused or not, and every administrative change is written to an audit log.
- [docs/security-review.md](docs/security-review.md) is the full review: what was checked,
  which limits the portal knowingly has, and what a self-hoster has to do themselves.
- See [SECURITY.md](SECURITY.md) for supported versions and how to report vulnerabilities.

## Layout

| Path                    | What it is                                                            |
| ----------------------- | --------------------------------------------------------------------- |
| `apps/web`              | Angular front end (standalone, zoneless, Angular Material, DE/EN/FR)  |
| `apps/api`              | NestJS back end for the front end; holds the API key and the database |
| `packages/echocall-api` | Typed client generated from the published OpenAPI document            |
| `docker/`               | Dockerfile and Compose setup                                          |
| `docs/`                 | Architecture, configuration, self-hosting, operating, security        |

## Development

Requires Node.js 22.22.3+ and **npm 12** (`npm install -g npm@12`; the lockfile is written
by npm 12 and older versions fail to install it).

```bash
npm ci
npm run check      # vendor-neutrality and white-label checks
npm run lint
npm run typecheck
npm test           # apps/api needs a local test database, see docs/database.md
npm run build
npm run e2e        # browser smoke run against the built portal, see docs/architecture.md
```

Architecture notes live in [docs/architecture.md](docs/architecture.md), contribution
guidelines in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
