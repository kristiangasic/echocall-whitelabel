# EchoCall Light

A self-hosted, white-label customer portal and admin panel that runs entirely on the
[EchoCall](https://echocall.de) public API. Operators run it under their own brand, invite
their own customers, and every feature the customers use is served by the EchoCall platform
through a single reseller API key.

**Status: work in progress.** The first sub-project (foundation: accounts, sessions, branding,
admin panel, customer context) is being built. Nothing here is ready for production yet.

## Requirements

- Node.js 22.22.3 or newer and npm 10
- PostgreSQL 14+ or MariaDB 10.6+ / MySQL 8 for the portal's own data (accounts, sessions, settings, audit)
- An EchoCall reseller account with an active subscription and an API key

## Layout

| Path                    | What it is                                                            |
| ----------------------- | --------------------------------------------------------------------- |
| `apps/web`              | Angular front end (standalone, zoneless, Angular Material, DE/EN/FR)  |
| `apps/api`              | NestJS back end for the front end; holds the API key and the database |
| `packages/echocall-api` | Typed client generated from the published OpenAPI document            |
| `docs/`                 | Architecture, configuration and self-hosting guides                   |

## Development

```bash
npm install
npm run check      # vendor-neutrality and white-label checks
npm run lint
npm run typecheck
npm test
npm run build
```

## License

Apache-2.0. See [LICENSE](LICENSE).
