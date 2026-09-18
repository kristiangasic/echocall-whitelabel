# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Self-service sign-up, off by default. With it on, a sign-up form appears on the sign-in
  page and each sign-up opens a customer account at the service and a portal login in one
  step. The form answers the same way whether the address was free, already had an account
  or was refused by the service, so it cannot be used to look accounts up.
- Sign-in links, off by default. With them on, people ask for a one-time link by e-mail
  instead of typing a password; the link is valid for 15 minutes and works once. An
  invitation accepted while links are on may leave the password empty, and such an account
  signs in by link only. A second factor still applies, and passwords keep working for the
  accounts that have one.
- **Settings, Sign-up** in the admin panel carries both switches. Neither can be switched
  on while no mail server is configured, because both depend on mail.

### Changed

- English is the primary language. A fresh portal starts in English, the sign-in page and
  every unauthenticated page are English, and a browser that asks for a language the portal
  does not carry is answered in English rather than German. German and French are unchanged
  and still complete; an operator can still make either the default under Settings. New
  strings are written in English first.

### Fixed

- Collections are read whether the service answers them as a bare array or wrapped in a
  `{ data }` envelope. Which of the two arrives depends on the endpoint and on the release
  the service runs; the portal used to require the envelope, so an operator panel talking
  to an older service showed an empty customer list and an error instead of the customers.

## [0.1.0] - 2026-09-17

First public release.

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

[0.1.0]: https://github.com/echocall/echocall-light/releases/tag/v0.1.0
