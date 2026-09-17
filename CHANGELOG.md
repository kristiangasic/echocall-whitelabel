# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Notification bell with unread counter, polling, and mark-as-read.
- Billing tab in the account page: plan, balance, invoices and wallet movements, with
  invoice PDFs streamed through the portal so the upstream host never reaches the browser.
- Widget proxy under `/embed`: the chat widget and its assets are served from the
  operator's own domain with a short-lived cache that survives upstream outages.
- Angular front end: standalone zoneless app with Material, runtime branding (name, logo,
  color re-tint), DE/EN/FR translations, lazy route chunks.
- Invite and password reset mails via SMTP with one-time-link fallback.
- Container deployment: multi-stage Dockerfile, Docker Compose with PostgreSQL, static
  web serving from the API, `/healthz` and `/readyz` endpoints, strict Content-Security-Policy.
- CI (checks, API tests against PostgreSQL and MariaDB, Docker build) and a release
  workflow publishing images to GHCR on tags.
- Documentation: README, architecture, configuration, self-hosting and database guides,
  security policy, contribution guidelines.
