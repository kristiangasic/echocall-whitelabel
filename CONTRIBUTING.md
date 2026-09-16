# Contributing

Thanks for helping improve EchoCall Light!

## Setup

- Node.js 22.22.3+ and npm 12 (`npm install -g npm@12`; the lockfile is written by npm 12
  and older versions fail to install it).
- `npm ci` at the repository root (npm workspaces).
- The `apps/api` tests need a disposable database, by default PostgreSQL on
  `127.0.0.1:5433` with a database `echocall_light_test`; override with
  `TEST_DATABASE_URL`. See [docs/database.md](docs/database.md).

## Before you open a pull request

```bash
npm run format     # prettier
npm run check      # vendor-neutrality and white-label checks
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the same steps, plus the API test suite against PostgreSQL **and** MariaDB, plus a
Docker image build. All of them must pass.

## Ground rules

- **White label is a feature.** Nothing an operator's customer can see may mention
  EchoCall or any upstream vendor; brand strings come from the operator's branding
  settings. `npm run check` enforces this - do not weaken the checks to get a change in.
- **Both database families.** Schema changes and queries must work on PostgreSQL and
  MariaDB/MySQL; migrations are forward-only and run at startup.
- **Stable error codes.** The API returns `{ error: { code, message } }`; the front end
  translates codes. New errors need a code and translations in DE, EN and FR.
- **Three languages.** Every user-facing string needs `de`, `en` and `fr` entries in the
  Transloco files.
- **Tests come with the change.** New endpoints get supertest specs; new front-end logic
  gets Vitest specs.

## Commit style

Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, ...), imperative mood, one
logical change per commit. Add an entry under `[Unreleased]` in
[CHANGELOG.md](CHANGELOG.md) for anything an operator would notice.
