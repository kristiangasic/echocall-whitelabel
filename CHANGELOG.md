# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-22

### Added

- A code of conduct, issue and pull request templates, and a dependency bot, so the
  repository reads the way a public one is expected to.
- Self-service sign-up, off by default. With it on, a sign-up form appears on the sign-in
  page and each sign-up opens a customer account at the service and a portal login in one
  step. The form answers the same way whether the address was free, already had an account
  or was refused by the service, so it cannot be used to look accounts up.
- Sign-in links. Whoever wants in types their e-mail address and follows the link that
  arrives: valid for 15 minutes, usable once, and a second factor still applies. The page
  answers the same way whether or not the address has an account here.
- A way in that does not need the mail server, for the operator on the machine itself:
  `docker compose exec app node apps/api/dist/cli/sign-in-link.js you@example.com` prints
  the link the mail would have carried. The browser smoke run uses the same command, so it
  is exercised on every run.
- **Settings, Sign-up** in the admin panel carries the sign-up switch. It cannot be
  switched on while no mail server is configured, because a sign-up depends on mail.
- **Numbers** in the admin panel can remove a number from the inventory. Importing was a
  one-way street until now: a trunk typed in wrong, or one whose contract has ended,
  stayed in the list for good. The button asks first, and the service refuses a number a
  customer still holds, so a working line cannot be dropped by accident. It needs a
  service that carries `DELETE /resellers/phone-numbers/{id}`; against an older one the
  button answers with an error and nothing is removed.
- **Invoices** in the admin panel hands an invoice over as a PDF, from the list and from
  the invoice's own page. Raising one was possible before, handing it over was not. The
  service renders the document and the portal streams the bytes, so reading it needs
  nothing but a portal session. It needs a service that carries
  `GET /resellers/invoices/{id}/pdf`.
- **Settings, Invoice details** carries what goes on those invoices in the operator's own
  name: address, tax numbers, bank details, payment term and footer. It names the
  mandatory fields that are still empty, because while one of them is, the service refuses
  to raise or render an invoice at all.

### Changed

- The two overview pages were rebuilt in one visual language. The customer's overview
  opens with an account strip (plan, status, balance, current period), measures voice
  minutes and chat conversations against the plan's allowance with a meter, draws the
  calls of the last thirty days, and lists the most recent conversations as a table with
  kind, counterpart, duration and status. The operator's overview opens with the
  connection as a strip across the top, keeps one panel per figure, and lists the open
  tickets under their count instead of only counting them.
- The project is called EchoCall White Label Portal. The repository, the container
  image, the npm workspaces (`@echocall/whitelabel-api`, `-web`, `-api-client`) and the
  example database names carry `whitelabel` instead of `light`, because the old name
  said nothing about what the software does. An existing install keeps its data when
  `.env` pins the old names (`COMPOSE_PROJECT_NAME=echocall-light`, `DB_NAME=echocall_light`
  and `DB_USER=light`), because Compose names the volume after the project and the bundled
  database and its user after `DB_NAME` and `DB_USER`, and all three defaults changed with
  the rename.
  [docs/self-hosting.md](docs/self-hosting.md) has the step.
- The generated client carries `hubLoginEnabled` on customer creation, so the field the
  portal already sends is typed rather than passed untyped, and the delete endpoint's
  documented behaviour (it cascades, and refuses a customer who still holds a
  subscription) is in the vendored document.
- English is the primary language. A fresh portal starts in English, the sign-in page and
  every unauthenticated page are English, and a browser that asks for a language the portal
  does not carry is answered in English rather than German. German and French are unchanged
  and still complete; an operator can still make either the default under Settings. New
  strings are written in English first.
- Mail carries the whole way in now, so a portal for more than a handful of people needs an
  SMTP server. Without one the admin panel still shows every invitation and every sign-in
  link instead of mailing it, and the operator passes it on.

### Removed

- Passwords, everywhere: none on the sign-in page, none in the invitation, none in the
  account page, no hash in the database, no forgot and reset routes, no password rules.
  Nothing is left to guess, to reuse or to read out of a backup. Switching a second factor
  off now asks for a current code from the app instead of a password, and an operator sends
  a sign-in link where the user list used to offer a password reset.
- `auth.password_reset` from the audit log. Sending someone a way in is recorded as
  `users.sign_in_link_sent`.

### Fixed

- `npm run typecheck` builds the API client first, so a fresh checkout (and the CI run)
  no longer fails on the client's missing type output.
- The README no longer says that someone at EchoCall has to enable reseller access: an
  account is ready as soon as the card verification is done.
- The browser smoke run starts again. Its harness read a value it never imported, so the
  process died the moment it reported itself ready, and the specs themselves were refused
  by the test runner's loader for reading `import.meta` in a file it compiles to
  CommonJS. Both paths now run on a desktop window and on a phone again.
- `refresh-spec` refuses a download that has fewer paths than the document already in
  `spec/`. A service answering that path from an outdated file used to overwrite the
  vendored document with an older one, which silently dropped endpoints from the generated
  client.
- Collections are read whether the service answers them as a bare array or wrapped in a
  `{ data }` envelope. Which of the two arrives depends on the endpoint and on the release
  the service runs; the portal used to require the envelope, so an operator panel talking
  to an older service showed an empty customer list and an error instead of the customers.
- Deleting a customer who never had a portal login is recorded with the address the
  service had for them. The audit row is all that remains of the customer, and for such a
  customer it used to carry no address at all.

## [0.1.0] - 2026-09-17

The first complete version. It was never tagged, so 0.2.0 is the first tagged release; the
link below points at the commit that carried this version.

### Added

- Repository skeleton with license, formatting rules and the vendor-neutrality and white-label checks.
- Typed API client (`packages/echocall-api`) generated from the published EchoCall OpenAPI document.
- NestJS back end: validated configuration, Kysely database layer with automatic startup
  migrations for PostgreSQL and MariaDB/MySQL, session authentication with CSRF protection
  and rate limiting, first-run setup, audit log.
- Admin panel API and pages: overview with connection status and account counts, user
  management (invite, edit, enable/disable, delete, resend invite, password reset),
  branding settings with live preview, SMTP settings with test mail.
- Customer portal API and pages: profile and password, usage dashboard with minutes,
  conversations, balance and plan of the linked customer account.
- Customer workspace: voice agents and chatbots (create, edit, test, publish), phone
  numbers, conversation history with transcripts and recordings, analytics, knowledge
  base, integrations and webhooks, outbound campaigns, and support requests.
- Allow-listed hub proxy under `/api/hub`: workspace pages reach the documented customer
  endpoints in the context of their own customer account, while reseller, provisioning
  and payment surfaces stay unreachable from the browser.
- Operator panel for the reseller business: customers (created with their portal login in
  one step, balance top-ups and withdrawals, transactions, usage, subscriptions), plans and
  pricing with margin suggestions, subscriptions, add-on sales, invoices, phone number
  import and assignment, support tickets with replies and escalation, revenue and cost
  analytics, and an inventory of the agents customers built.
- Allow-listed operator proxy under `/api/admin/hub`: the admin panel reaches the reseller
  endpoints in the operator's own context, while payment secrets, credit purchases and raw
  customer writes stay unreachable from the browser.
- Service-side operator settings (company data on the invoices you issue, portal logo,
  payment keys as write-only fields) and the service activity log, each on their own tab
  next to the portal settings and the portal audit log.
- Impersonation: an operator can open the portal as one customer and hand the session back,
  with both steps in the audit log; it refuses accounts without a portal login, other
  administrators and logins that are not active yet.
- Notification bell with unread counter, polling, and mark-as-read.
- Billing tab in the account page: plan, balance, invoices and wallet movements, with
  invoice PDFs streamed through the portal so the upstream host never reaches the browser.
- Widget proxy under `/embed`: the chat widget and its assets are served from the
  operator's own domain with a short-lived cache that survives upstream outages.
- Angular front end: standalone zoneless app with Material, runtime branding (name, logo,
  color re-tint), DE/EN/FR translations, lazy route chunks.
- Invite and password reset mails via SMTP with one-time-link fallback.
- Two-factor authentication: TOTP with an encrypted secret, ten single-use recovery codes,
  and an operator path to clear the second factor of an account that lost both.
- Password rules without a network call: at least ten characters, and common choices and
  repeated fragments refused on the server and in the form, in all three languages.
- Sign-ins in the audit log, refused ones with their reason, so an attempt series is
  visible to an operator.
- Container deployment: multi-stage Dockerfile, Docker Compose with PostgreSQL, static
  web serving from the API, `/healthz` and `/readyz` endpoints, strict Content-Security-Policy.
- Browser smoke run (`npm run e2e`): the built portal, a stub of the service and a
  throwaway database, driven through Chromium on a desktop window and on a phone.
- CI (checks, API tests against PostgreSQL and MariaDB, the smoke run, a production
  dependency audit, Docker build) and a release workflow that verifies the tag before it
  publishes the image to GHCR.
- Documentation: README, architecture, configuration, self-hosting, database and operating
  guides, a written security review, security policy, contribution guidelines.

[Unreleased]: https://github.com/kristiangasic/echocall-whitelabel/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/kristiangasic/echocall-whitelabel/releases/tag/v0.2.0
[0.1.0]: https://github.com/kristiangasic/echocall-whitelabel/tree/c41c033
