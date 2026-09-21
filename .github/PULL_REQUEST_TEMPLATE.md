## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- What was wrong, or what this makes possible. -->

## Checked before opening

- [ ] `npm run format`
- [ ] `npm run check` (vendor neutrality and white label)
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run e2e`, if this touches a path the smoke run walks (first-run setup, sign-in,
      inviting a customer, the workspace, support requests)

## Ground rules this change keeps

- [ ] Nothing an operator's customer can see names EchoCall or any upstream vendor
- [ ] Schema changes and queries work on PostgreSQL and on MariaDB/MySQL
- [ ] New user-facing strings exist in `en`, `de` and `fr`
- [ ] New endpoints have supertest specs; new front-end logic has Vitest specs
- [ ] Every page this touches still works at phone width
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]` if an operator would notice
