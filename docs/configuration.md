# Configuration

Every setting is an environment variable, read once at startup. A required variable that
is missing or malformed stops the start with a message naming it; the server never comes up
half configured. An optional variable that is missing falls back to the default in the
tables below. In development you can put them in a `.env` file in the repository root; the
Docker Compose setup reads `../.env` as well.

## Required

| Variable           | Description                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`          | Public URL people use to reach the portal, e.g. `https://portal.example.com`. Used for links in mails and to decide whether cookies are Secure.                                                                     |
| `APP_SECRET`       | Random string, at least 32 characters. Encrypts the stored SMTP password and every second-factor secret. Generate with `openssl rand -hex 32`. Changing it makes both unreadable; see [operating.md](operating.md). |
| `DATABASE_URL`     | Connection URL of the portal database. `postgres://`, `postgresql://`, `mysql://` and `mariadb://` are accepted.                                                                                                    |
| `ECHOCALL_API_KEY` | Your EchoCall reseller API key (`eck_live_` followed by 64 hex characters). Keep it secret; it never reaches the browser.                                                                                           |

## Optional

| Variable              | Default                          | Description                                                                                                                                                                                                       |
| --------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                | `3000`                           | Port the HTTP server listens on.                                                                                                                                                                                  |
| `NODE_ENV`            | `development`                    | Standard Node environment switch.                                                                                                                                                                                 |
| `DATABASE_SSL`        | `disable`                        | TLS towards the database: `disable`, `require`, or `no-verify` (encrypt but accept self-signed certificates).                                                                                                     |
| `COOKIE_SECURE`       | on when `APP_URL` is `https`     | Force or disable the `Secure` flag on the session cookie.                                                                                                                                                         |
| `TRUST_PROXY`         | `1`                              | Number of reverse proxies in front of the app; needed for correct client IPs in the audit log and rate limiting. `0` when exposed directly.                                                                       |
| `ECHOCALL_API_URL`    | `https://hub.echocall.de/api/v1` | Base URL of the EchoCall public API. Only change on instruction from EchoCall support.                                                                                                                            |
| `ECHOCALL_WIDGET_URL` | `https://cdn.echocall.de`        | Origin of the chat widget files. The portal re-serves them under `/embed` on its own domain, so customer sites embed `<script src="{your portal}/embed/chat.js">` and never see the upstream.                     |
| `WEB_DIST_DIR`        | unset                            | Absolute path to the built Angular app (`apps/web/dist/web/browser`). When set, the API serves the web UI itself; the Docker image sets it for you. When unset, only `/api`, `/healthz` and `/readyz` are served. |

## Mail (optional)

Without SMTP the portal still works: invite and password reset links are shown to the
admin as one-time links to pass on. With SMTP they are mailed automatically. SMTP can also
be configured at runtime in the admin panel; environment variables take precedence and are
shown there as locked.

| Variable      | Default | Description                                                                       |
| ------------- | ------- | --------------------------------------------------------------------------------- |
| `SMTP_HOST`   | unset   | Hostname of your SMTP server. Enables mailing.                                    |
| `SMTP_PORT`   | `587`   | Port; `465` implies TLS-on-connect (see below).                                   |
| `SMTP_SECURE` | `false` | `true` for TLS-on-connect (usually port 465); `false` uses STARTTLS when offered. |
| `SMTP_USER`   | unset   | Username, when the server requires authentication.                                |
| `SMTP_PASS`   | unset   | Password for `SMTP_USER`.                                                         |
| `SMTP_FROM`   | unset   | From address of portal mails, e.g. `portal@example.com`.                          |

## Docker Compose only

| Variable      | Description                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `DB_PASSWORD` | Password of the bundled PostgreSQL container; also used to build `DATABASE_URL` for the app service. |

## Test suite

| Variable            | Description                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL` | Database the `apps/api` tests run against (they create and drop their own schemas). Defaults to a local PostgreSQL on port 5433, database `echocall_light_test`. |

## Browser smoke run

`npm run e2e` starts a built portal, a stub of the EchoCall API and a throwaway database,
then drives the result through a real browser. Every value has a default, so the run needs
no configuration on a developer machine; the variables exist so a pipeline can hand out its
own database and ports.

| Variable             | Default                                                            | Description                                                                                                                |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `SMOKE_DATABASE_URL` | `postgres://postgres:postgres@127.0.0.1:5433/echocall_light_smoke` | PostgreSQL only. The run drops and recreates the `public` schema of this database, so never point it at anything you keep. |
| `SMOKE_PORTAL_PORT`  | `4010`                                                             | Port the portal under test listens on.                                                                                     |
| `SMOKE_HUB_PORT`     | `4011`                                                             | Port of the API stub. The portal under test gets `ECHOCALL_API_URL` pointing here, so no real service is ever reached.     |
