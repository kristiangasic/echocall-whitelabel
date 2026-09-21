# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately to **security@echocall.de**. Do not open a public
issue for security problems. Include steps to reproduce and, if possible, the affected
version or commit. You will receive an acknowledgement within a few business days; please
give us reasonable time to ship a fix before disclosing.

## Supported versions

The latest release and the current `main` branch receive security fixes. Older releases
are not patched - upgrading is the fix.

## What the portal does, in one page

`docs/security-review.md` is the written review of the portal: session and cookie
handling, CSRF, rate limits, sign-in and token rules, what each of the two proxies
forwards, where every secret lives, what the audit log covers, the headers the portal
sets, the dependency audit, the limits it knowingly has, and the list of things a
self-hoster has to do that the portal cannot do for them. Read it before you put an
installation on the open internet.

## Scope and design notes for operators

- The EchoCall reseller API key is the most sensitive value in an installation. It lives
  only in the server environment (`.env` or your orchestrator's secret store) and is never
  sent to the browser or written to the database or logs.
- There are no passwords in the portal: no field, no hash column, no reset route. Whoever
  wants in types their address and follows a link that is valid for 15 minutes and works
  once, and a second factor still applies where an account has one. The mailbox is
  therefore the credential, which is why a second factor belongs on every operator
  account.
- Sessions are server-side, referenced by an httpOnly cookie; mutating requests
  additionally require a CSRF header.
- Invitation, sign-in and second-factor tokens are single-use and expire; only their
  hashes are stored.
- Login and token endpoints are rate limited. A strict Content-Security-Policy is set on
  the delivered web UI.
- Sign-ins, refused sign-ins and every change an operator makes are written to the audit
  log, which is where a series of attempts becomes visible.
- Run the portal behind TLS. `COOKIE_SECURE` defaults to on when `APP_URL` is `https`.
- Vulnerabilities in the EchoCall platform itself belong to EchoCall support, not this
  repository.
