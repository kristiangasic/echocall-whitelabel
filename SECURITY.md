# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately to **security@echocall.de**. Do not open a public
issue for security problems. Include steps to reproduce and, if possible, the affected
version or commit. You will receive an acknowledgement within a few business days; please
give us reasonable time to ship a fix before disclosing.

## Supported versions

The latest release and the current `main` branch receive security fixes. Older releases
are not patched - upgrading is the fix.

## Scope and design notes for operators

- The EchoCall reseller API key is the most sensitive value in an installation. It lives
  only in the server environment (`.env` or your orchestrator's secret store) and is never
  sent to the browser or written to the database or logs.
- Passwords are hashed with Argon2id. Sessions are server-side, referenced by an httpOnly
  cookie; mutating requests additionally require a CSRF header.
- Invite and password reset tokens are single-use and expire; only their hashes are
  stored.
- Login and token endpoints are rate limited. A strict Content-Security-Policy is set on
  the delivered web UI.
- Run the portal behind TLS. `COOKIE_SECURE` defaults to on when `APP_URL` is `https`.
- Vulnerabilities in the EchoCall platform itself belong to EchoCall support, not this
  repository.
