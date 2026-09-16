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

| Module     | Responsibility                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `config`   | Loads and validates the environment once at startup (zod); fails fast                            |
| `db`       | Kysely with a PostgreSQL or MySQL dialect picked from `DATABASE_URL`; runs migrations on startup |
| `echocall` | Typed client factory for the EchoCall API plus a cached hub status (periodic re-check)           |
| `auth`     | Sessions (httpOnly cookie), CSRF guard, roles guard, login rate limiting                         |
| `setup`    | First-run: connection check and creation of the initial admin                                    |
| `admin/*`  | Overview with hub status and user counts; user management (invite, edit, disable, delete)        |
| `settings` | Branding (name, logo, color, legal links, default language) and SMTP                             |
| `account`  | Own profile, password change, and the customer usage overview                                    |
| `audit`    | Append-only log of admin actions with actor, IP and outcome                                      |
| `mail`     | Invite and password reset mails via SMTP; falls back to one-time links                           |
| `health`   | `/healthz` (liveness) and `/readyz` (database + hub) for orchestration                           |

Cross-cutting rules:

- Guards are global: every route requires a session unless marked `@Public()`;
  mutating routes additionally require the `X-Requested-With` header (CSRF).
- Errors are always `{ error: { code, message, fieldErrors? } }` with stable codes;
  the front end translates codes, never messages.
- Upstream failures map to stable codes too (`no_active_subscription`,
  `invalid_api_key`, `upstream_unavailable`), so operators see what to fix.

## Front end (`apps/web`)

Angular (standalone components, zoneless, signals) with Angular Material and Transloco
(DE/EN/FR). The shell lazy-loads one route chunk per page. Branding is applied at runtime:
the API serves the operator's name, logo and color, and the theme is re-tinted from that
color - no rebuild needed. Test infrastructure is Vitest with jsdom.

## API client (`packages/echocall-api`)

Generated from the published EchoCall OpenAPI document (`openapi-typescript` +
`openapi-fetch`). Regenerate with `npm run refresh-spec && npm run generate -w
packages/echocall-api` when the upstream API gains endpoints.

## Key decisions

- **One key, two audiences.** Admins operate the portal; users are linked to EchoCall
  customer accounts under the reseller. Customer-scoped calls send the act-as header for
  the linked customer; the key itself is never scoped down, so it must be protected.
- **Sessions over JWTs.** Server-side sessions can be revoked instantly (user disabled or
  deleted), which matters more here than statelessness.
- **Multi-database via Kysely.** One query builder, two dialects (postgres, mysql), the
  same migrations. PostgreSQL is the reference database; MariaDB/MySQL are covered by the
  same test suite in CI.
- **White label enforced by CI.** `npm run check` fails the build when customer-facing
  texts or bundles leak the EchoCall brand or any upstream vendor name.
