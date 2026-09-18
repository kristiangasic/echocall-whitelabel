# Security review

Reviewed on 2026-09-17 against the state of `main` before the 0.1.0 release.

How it was reviewed: every route, guard and service of the back end was read, the test
suites of both applications were run, the browser smoke run was executed against a built
portal, the headers of a running installation were read from the wire, and the dependency
audit was run for the production tree and for the whole tree.

This document is the record of that pass. It says what was checked, what was changed
because of it, and which limits the portal knowingly has.

## Sessions and the cookie

- A session lives in the `sessions` table. The cookie carries a 32 byte random token;
  only its SHA-256 hash is stored, so a copy of the database does not hand out sessions.
- The cookie `ecl_session` is set `httpOnly`, `SameSite=Lax`, `Path=/`, and `Secure`
  whenever `COOKIE_SECURE` is on, which it is by default as soon as `APP_URL` is an
  `https` address.
- Lifetime is 30 days. The expiry slides only once fewer than 15 days remain, so a session
  in daily use is not rewritten on every request.
- Every request resolves the session together with the account row and refuses it when the
  account is no longer `active`. Disabling an account therefore ends its sessions at the
  next request, and suspending a customer or disabling a portal user revokes them outright.
- Changing or resetting a password revokes every session of that account.
- Signing in always creates a new session row, so a token that existed before the sign-in
  cannot become an authenticated one.
- Expired rows are deleted whenever a session is created and whenever one is resolved
  after its expiry.

## CSRF

- A global guard runs before everything else and refuses `POST`, `PUT`, `PATCH` and
  `DELETE` without the header `x-requested-with: XMLHttpRequest`. A browser adds a custom
  header only from same-origin script, so a cross-site form post cannot pass.
- The guard sits in front of the session guard, so it also covers the routes that are open
  without a session (sign-in, invitation, password reset, first-run setup).
- There is no exception anywhere in the code base: every mutating route of the portal is
  behind it. The only unprotected surfaces are `GET` routes.

## Rate limits

Five attempts per minute and client address, applied to the routes where guessing pays:
sign-in, forgot password, reset password, accept invitation, the second factor step, the
first-run key check and the first-run administrator form. Everything else is behind a
session.

The client address comes from the reverse proxy through `TRUST_PROXY` (one hop by
default). A wrong value makes every request look like it comes from the proxy.

## Passwords

- Argon2id with the OWASP minimum: 19 MiB memory, two iterations, one lane.
- A sign-in against an account without a password hash still costs one verification, so
  the answer time does not say whether an account exists. The answer itself is the same
  for an unknown address and a wrong password.
- At least 10 characters, at most 200. Length carries the strength, which is why there is
  no rule about upper case or digits.
- Added in this review: a password that passes the length rule is refused when it is one
  of the common choices (`apps/api/src/auth/weak-password.ts`, the list covers German,
  English and French) or when the whole password is one piece of at most four characters
  repeated. The web front end mirrors both rules so the hint appears while typing.

## Invitation, reset and challenge tokens

- 32 bytes of randomness, handed out once, stored as SHA-256 only.
- Lifetimes: invitation 7 days, password reset 60 minutes, second factor challenge 5
  minutes.
- Every token counts its failed attempts and dies after three, so a challenge cannot be
  worn down by trying codes.
- A token is consumed only on success. A form the portal refuses (a weak password, for
  example) leaves the token usable, which is what a person expects after a typo.

## Sign-up and sign-in links

- Both are off in a fresh portal, and the portal refuses to switch either on while no mail
  server is configured: the links would go nowhere.
- Neither route says whether an address has an account. A sign-up answers `202 Accepted`
  whether the account was opened, already existed or was refused by the service, and a
  request for a sign-in link answers `204 No Content` either way. Both are rate limited
  per address like the other unauthenticated routes.
- A sign-in link is one of the one-time tokens above: 32 random bytes, stored as SHA-256,
  valid 15 minutes, spent on use, and a second request replaces the first.
- An account without a password hash cannot be signed in with a password. The verification
  still runs against a dummy hash, so the answer time says nothing.
- A second factor applies to a link exactly as it does to a password: the link produces a
  challenge, not a session.
- Consuming a link while the operator has switched links off is refused, so turning the
  switch off also invalidates the links already in the post.

## Two factor

- TOTP with a secret that is stored encrypted (see below) and only becomes active once a
  code proves the authenticator app works.
- Ten recovery codes, shown once, stored as SHA-256, each usable once.
- The password step of an account with a second factor produces no session and no cookie,
  only a short lived challenge.
- An operator can clear the second factor of another account. That is written to the audit
  log, and it is the only way back for a customer who lost both the app and the codes.

## What the portal forwards to the service

Both proxies forward an explicit list of calls and answer 404 for everything else.

- The customer proxy (`apps/api/src/hub-proxy/allowlist.ts`) runs every call in the
  signed-in customer's own context, so the service scopes the answer to that customer.
  Reseller, provisioning and payment surfaces are not on the list.
- The operator proxy (`apps/api/src/admin/hub/admin-allowlist.ts`) runs as the reseller
  behind the configured key. Buying or burning credit, the billing keys and every raw
  write on a customer are deliberately absent; customer writes go through the portal's own
  route, which changes the service account and the portal login together.
- The API key never leaves the server. It is added to the outgoing request inside the
  client factory and appears in no answer, no log line and no table.

## Secrets

| Secret                              | Where it lives                    | How                                                  |
| ----------------------------------- | --------------------------------- | ---------------------------------------------------- |
| Service API key                     | Environment only                  | Never stored, never logged, never sent to a browser  |
| `APP_SECRET`                        | Environment only                  | Key material for everything below                    |
| SMTP password                       | `settings` table                  | AES-256-GCM, key derived from `APP_SECRET` with HKDF |
| TOTP secret                         | `users` table                     | AES-256-GCM, same derivation                         |
| Passwords                           | `users` table                     | Argon2id hash                                        |
| Session tokens                      | `sessions` table                  | SHA-256 of the token                                 |
| Invitation, reset, challenge tokens | `one_time_tokens` table           | SHA-256 of the token                                 |
| Recovery codes                      | `two_factor_recovery_codes` table | SHA-256 of the code                                  |

Nothing in this list is ever written to the audit log: the log holds addresses,
identifiers and the fields that changed, never a value from this table.

## Audit log

23 actions are recorded: the first-run setup, every customer change (created, updated,
suspended, unsuspended, deleted), every portal user change (invited, invitation resent,
updated, deleted, password reset sent, second factor cleared), the account's own changes
(password changed, second factor enabled or disabled), both branding and SMTP settings,
both ends of an impersonation, and, added in this review, `auth.signed_in`,
`auth.sign_in_failed` and `auth.password_reset`.

A refused sign-in records the address that was typed and the reason (`unknown_account`,
`wrong_password`, `account_disabled`), never the password. That is what makes a series of
attempts visible to an operator at all.

Each entry keeps the actor, the target, the client address and the time. The list is
readable for operators only.

## Impersonation

- Only an administrator can open a customer's portal, only for an account that has a
  portal login, only when that login is active, and never for another administrator.
- The session is handed over in place: the browser keeps its cookie, the row points at the
  customer and remembers the operator, and the portal shows the state in the shell.
- Handing it back requires the operator account to still exist and to still be an active
  administrator; otherwise the session ends.
- Both ends are written to the audit log with the customer and the address.
- Opening a customer's portal does not stamp a sign-in on the customer's account, so the
  customer's own last sign-in stays truthful.

## Headers

Read from a running installation on 2026-09-17:

```
Content-Security-Policy: default-src 'self';base-uri 'self';font-src 'self';form-action 'self';
  frame-ancestors 'none';img-src 'self' data:;object-src 'none';script-src 'self';
  script-src-attr 'none';style-src 'self' 'unsafe-inline';connect-src 'self'
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-DNS-Prefetch-Control: off
X-Download-Options: noopen
X-Frame-Options: SAMEORIGIN
X-Permitted-Cross-Domain-Policies: none
X-XSS-Protection: 0
```

`style-src` needs `'unsafe-inline'` because Angular writes component styles into the
document at runtime; `img-src` needs `data:` because an uploaded logo is stored as a data
URL. `upgrade-insecure-requests` is left out while `APP_URL` is a plain address, so an
installation inside a company network keeps working.

The embed surface is the one exception and sets `frame-ancestors *` for itself: the chat
widget exists to be framed by customer sites. It serves files, carries no session and
reaches nothing but the cached widget assets, and a requested asset name has to be a plain
file name.

## Request and answer shape

- A JSON body is limited to 512 KB; an uploaded logo is limited to 200 KB of base64 and to
  PNG, JPEG, WebP or SVG.
- Every route validates its body, its query and its path parameters with a schema before
  the code behind it runs.
- Errors leave the portal in one envelope, `{ error: { code, message, details? } }`. An
  unexpected exception answers `internal_error` and is logged on the server; the stack
  never reaches the browser.
- Links an operator can set (imprint, privacy) have to be `http` or `https` addresses, so
  none of them can carry a script into the page.

## Dependencies

`npm audit` and `npm audit --omit=dev` both report 0 vulnerabilities on 2026-09-17. The
pipeline runs the production audit on every push, so a new advisory fails the build.

## What this review changed

1. `/readyz` and, once the portal is set up, `/api/setup/status` used to answer with the
   role and the address of the account behind the API key, and with the message the
   service had sent. Both are reachable without a session. They now answer whether the
   connection works and when it was last checked; the full report stayed where it is
   useful, in the admin overview behind a sign-in.
2. Sign-ins were not written to the audit log at all, so a series of refused attempts left
   no trace an operator could see. Successful sign-ins, refused sign-ins and completed
   password resets are recorded now.
3. A password of ten characters could be `passwort123`. Common choices and repeated
   fragments are refused now, on the server and in the form.
4. Accepting an invitation is rate limited like the other routes that are open without a
   session.

## Known limits

- **No account lockout.** Repeated sign-in attempts are slowed per client address, not per
  account, because locking an account by guessing at it would hand anyone a way to lock an
  operator out of their own portal. The audit log is what makes an attempt series visible.
- **The client address is what the proxy says.** With a wrong `TRUST_PROXY` the rate limit
  and the audit log see the proxy instead of the visitor.
- **The audit log covers the portal, not the service.** What an operator does while a
  customer's portal is open reaches the service as that customer; the portal records when
  the window opened and closed, the service records the calls.
- **A logo may be an SVG.** It is only ever placed in an `img` element, where no browser
  runs script, and `script-src 'self'` would refuse it anyway. Accepted as a convenience
  for operators whose logo is a vector file.
- **No breach list for passwords.** A self-hosted portal does not call out to a third
  party to check a password, so the check is the built-in list of common choices.
- **No idle timeout and no "sign out everywhere" button** for a person's own account. A
  password change revokes every session, and an operator can disable an account.
- **Second factor cannot be made mandatory** for every operator account. Turn it on per
  account.
- **`/healthz` and `/readyz` are open** so an orchestrator can use them without a
  credential. They say that a portal is running and whether it is healthy, nothing else.
- **Before the first administrator exists**, the first-run page shows the full connection
  report to whoever opens it. In that window, whoever reaches the portal can make
  themselves the administrator anyway, so the report adds nothing; the window closes with
  the first account.

## What a self-hoster has to do

The portal cannot do these for you:

1. **Put TLS in front of it.** The cookie is only marked `Secure` when the portal knows it
   is served over `https`.
2. **Keep `APP_SECRET` safe and stable.** It encrypts the SMTP password and every TOTP
   secret. Changing it makes both unreadable: the SMTP password has to be entered again
   and every second factor has to be set up again.
3. **Keep the API key in the environment**, out of the repository and out of backups you
   share. If it leaks, rotate it at the provider and put the new one in the environment.
4. **Protect the database.** It holds password hashes, session hashes and the encrypted
   secrets. Encrypt the backups, and do not keep them next to the environment file.
5. **Decide who can reach `/healthz` and `/readyz`** and block them at the proxy if they
   should not be public.
6. **Set `TRUST_PROXY`** to the number of proxies in front of the portal.
7. **Turn the second factor on for every operator account**, and keep the recovery codes
   somewhere other than the portal.
8. **Read the audit log** now and then, in particular the refused sign-ins.
9. **Upgrade.** Security fixes go into the newest release; older releases are not patched.
10. **Consider a limit at the edge** (fail2ban or a rate limit in the proxy) if the portal
    is reachable from the open internet.
