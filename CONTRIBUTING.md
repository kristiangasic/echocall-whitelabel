# Contributing

Thanks for helping improve EchoCall White Label Portal!

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

- Node.js 22.22.3+ and npm 12 (`npm install -g npm@12`; the lockfile is written by npm 12
  and older versions fail to install it).
- `npm ci` at the repository root (npm workspaces).
- The `apps/api` tests need a disposable database, by default PostgreSQL on
  `127.0.0.1:5433` with a database `echocall_whitelabel_test`; override with
  `TEST_DATABASE_URL`. See [docs/database.md](docs/database.md).
- The browser smoke run needs the same PostgreSQL server (it uses a second database,
  `echocall_whitelabel_smoke`) and the Playwright browsers: `npx playwright install chromium`.

## Before you open a pull request

```bash
npm run format     # prettier
npm run check      # vendor-neutrality and white-label checks
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e        # needs the build above: it drives the built portal in a browser
```

`npm run e2e` starts a built portal, a stub of the EchoCall API and a throwaway database,
and runs both smoke paths on a desktop window and on a phone. It never reaches the real
service. The variables that move its database and ports are in
[docs/configuration.md](docs/configuration.md); how it is put together is in
[docs/architecture.md](docs/architecture.md).

`npm run screenshots` starts the same harness, so it needs the build too, with a set of
invented customers, and writes the four images the README shows to `docs/images/`. Run it
after a change to a screen that appears there, look at the images, and commit them with
the change.

CI runs the same steps, plus the API test suite against PostgreSQL **and** MariaDB, plus a
Docker image build. All of them must pass.

## Ground rules

- **White label is a feature.** Nothing an operator's customer can see may mention
  EchoCall or any upstream vendor; brand strings come from the operator's branding
  settings. `npm run check` enforces this - do not weaken the checks to get a change in.
- **Both database families.** Schema changes and queries must work on PostgreSQL and
  MariaDB/MySQL; migrations are forward-only and run at startup.
- **Stable error codes.** The API returns `{ error: { code, message } }`; the front end
  translates codes. New errors need a code and translations in EN, DE and FR.
- **English first, three languages.** English is the primary language: write the string in
  `en` first, then add the `de` and `fr` entries. Every user-facing string needs all three
  in the Transloco files.
- **Tests come with the change.** New endpoints get supertest specs; new front-end logic
  gets Vitest specs. A change to a path the smoke run walks (first-run setup, sign-in,
  inviting a customer, the workspace, support requests) gets checked with `npm run e2e`
  before the pull request.
- **Mobile is not an afterthought.** Every page has to work at phone width; the smoke run
  drives the same paths on a phone viewport for that reason.

## Commit style

Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, ...), imperative mood, one
logical change per commit. Add an entry under `[Unreleased]` in
[CHANGELOG.md](CHANGELOG.md) for anything an operator would notice.
