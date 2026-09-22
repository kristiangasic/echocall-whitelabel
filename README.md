# EchoCall White Label Portal

**A self-hosted white label portal for AI voice and chat agents.** Run a customer portal
and admin panel under your own brand and domain, invite your own customers, and resell
voice and chat agents as your own product. Angular and NestJS, Apache-2.0 licensed, up and
running with one Docker command.

[![CI](https://github.com/kristiangasic/echocall-whitelabel/actions/workflows/ci.yml/badge.svg)](https://github.com/kristiangasic/echocall-whitelabel/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Release](https://img.shields.io/github/v/release/kristiangasic/echocall-whitelabel?display_name=tag&sort=semver)](https://github.com/kristiangasic/echocall-whitelabel/releases)
[![Node](https://img.shields.io/badge/node-22.22.3%2B-339933)](https://nodejs.org)

> **Read this first.** The portal is the interface, not the telephony. Every AI feature it
> offers is served by the [EchoCall](https://echocall.de) platform through a single
> reseller API key, so you need an account there. The free pay as you go plan, which costs
> a one euro card verification and no subscription fee, is enough to run everything you see
> here. [How to get a key](#requirements).

Your customers never see EchoCall: name, logo, colors and legal links all come from your
branding settings.

**Who it is for:** agencies and resellers who want to offer voice and chat agents to their
own customers under their own brand, without building a portal from scratch.

## What it looks like

The operator's side on the left, the customer's side on the right, taken from a portal
filled with invented example customers (`npm run screenshots` regenerates them).

<p>
  <img src="docs/images/admin-overview.png" width="49%" alt="Admin panel: overview with the connection to the service, customers, subscriptions, portal balance and open tickets">
  <img src="docs/images/customer-dashboard.png" width="49%" alt="Customer portal: dashboard with minutes used, chats held, balance, plan and recent conversations">
</p>
<p>
  <img src="docs/images/admin-customers.png" width="49%" alt="Admin panel: customer list with service account, portal login, balance and creation date">
  <img src="docs/images/customer-conversations.png" width="49%" alt="Customer portal: call list with counterpart, start, duration and outcome">
</p>

## How it works

- You (the operator) sign in to the **admin panel** and run the business there: customers
  (create an EchoCall account and its portal login in one step, top up and withdraw
  balance, read transactions and usage), plans and pricing, subscriptions, add-ons,
  invoices and their PDF, phone numbers, support tickets, revenue and cost analytics,
  the agents your customers built, your own company data and payment keys, plus portal
  branding, mail settings and the audit log.
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

- An EchoCall account and an API key (`eck_live_...`). Sign up at
  [echocall.de](https://echocall.de) and complete the card verification (one euro, no
  monthly fee on the pay as you go plan). The account is ready the moment that is done:
  nothing to apply for, nobody to write to. Then create the key under **Developer**; the
  portal uses it to create customer accounts on your behalf.
- Docker (recommended), or Node.js 22.22.3+ with npm 12 for a manual install
- Optional: your own PostgreSQL 14+, MariaDB 10.6+ or MySQL 8 server
  (the Docker Compose setup ships a PostgreSQL container)

## Quick start with Docker Compose

```bash
git clone https://github.com/kristiangasic/echocall-whitelabel.git
cd echocall-whitelabel
cp .env.example .env
# Edit .env: set APP_URL, APP_SECRET, ECHOCALL_API_KEY and DB_PASSWORD
docker compose up -d
```

Open the app (port 3000, put a TLS-terminating reverse proxy in front for production) and
follow the first-run setup: it checks the connection to EchoCall and creates your admin
account. See [docs/self-hosting.md](docs/self-hosting.md) for reverse proxy examples,
updates and backups, and [docs/operating.md](docs/operating.md) for everything after that:
the first hour, what to watch, a rotated API key, a lost second factor, a mail server
that has stopped working, backup and restore, upgrades.

## Using an external database

Point `DATABASE_URL` at your own server instead of the bundled container:

```
DATABASE_URL=postgres://light:secret@db.example.com:5432/echocall_whitelabel
DATABASE_URL=mariadb://light:secret@db.example.com:3306/echocall_whitelabel
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

One switch under **Settings, Sign-up** changes who else gets in. It is off in a fresh
portal and it needs a mail server: with **Anyone may create an account** on, a sign-up
form appears on the sign-in page, and whoever fills it in becomes a customer of yours at
the service and a user here, in one step.

## Signing in

There are no passwords in this portal, anywhere. Whoever wants in types their e-mail
address and gets a link that is valid for 15 minutes and works once; a second factor, if
the account has one, is still asked for afterwards. Nothing about an address is revealed:
the answer reads the same whether or not an account exists.

That makes the mail server part of the way in, so the portal ships with a way past it. On
the machine itself, this prints the same link the mail would have carried:

```bash
docker compose exec app node apps/api/dist/cli/sign-in-link.js you@example.com
```

## Security

- Sessions are server-side, in httpOnly cookies; mutating requests require a
  CSRF header. No password is stored, because none exists.
- The reseller API key stays in the server environment; the browser never receives it.
- Login and token endpoints are rate limited; a strict Content-Security-Policy is set.
- Every sign-in, refused or not, and every administrative change is written to an audit log.
- [docs/security-review.md](docs/security-review.md) is the full review: what was checked,
  which limits the portal knowingly has, and what a self-hoster has to do themselves.
- See [SECURITY.md](SECURITY.md) for supported versions and how to report vulnerabilities.

## Layout

| Path                    | What it is                                                            |
| ----------------------- | --------------------------------------------------------------------- |
| `apps/web`              | Angular front end (standalone, zoneless, Angular Material, EN/DE/FR)  |
| `apps/api`              | NestJS back end for the front end; holds the API key and the database |
| `packages/echocall-api` | Typed client generated from the published OpenAPI document            |
| `docker/`               | The Dockerfile; the Compose file sits at the repository root          |
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
