# Operating the portal

Everything an operator has to do after the portal is installed. Installation itself is in
[self-hosting.md](self-hosting.md), every setting in [configuration.md](configuration.md),
and the security review in [security-review.md](security-review.md).

## The first hour

1. Open the portal. The first-run page checks the connection to the service and creates
   your administrator account.
2. Set your branding (name, logo, colour, legal links, default language) under
   **Settings**. Everything a customer sees comes from there.
3. Enter an SMTP server. Nobody here has a password: everyone signs in with a link that
   is mailed to them, so a portal with more than a handful of people needs one. Without
   SMTP the portal shows every invitation and every sign-in link to you instead, and you
   pass it on by hand.
4. Turn on the second factor for your own account.
5. **Create a second administrator** and turn the second factor on there too. One
   administrator is a single point of failure: the paths back into a portal without a
   working administrator all end in the database (see below).
6. Take the first backup and try the restore once, on a scratch database. A backup you
   have never restored is a guess.

## What to watch

| Where          | What it tells you                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/healthz`     | The process is alive. Nothing else.                                                                                                |
| `/readyz`      | `200` when the database answers and the service connection works, `503` otherwise. It says whether, not why: the answer is public. |
| Admin overview | The full connection report: whether the key works, which account it belongs to, and the reason when it does not.                   |
| Audit log      | Who did what, and every sign-in, including the refused ones.                                                                       |
| Server log     | One line whenever the connection to the service changes state, with the reason code.                                               |

The portal re-checks the connection every ten minutes and after a manual re-check in the
admin overview.

## When the portal is not ready

`/readyz` answers `503` for two reasons.

- **`database: false`.** The database is unreachable or refuses the connection. Check the
  server, the credentials in `DATABASE_URL` and `DATABASE_SSL`.
- **`hub.ok: false`.** The connection to the service is not usable. The reason is not in
  the public answer; look in the admin overview or in the server log. The common codes:
  `invalid_api_key` (wrong or rotated key), `no_active_subscription` (the subscription
  behind the key has lapsed), `key_not_reseller` (the key belongs to an account that is
  not a reseller), `upstream_unavailable` (the service is down or unreachable).

A portal whose service connection is down still lets people sign in and still shows its
own pages; everything that needs live data shows an error instead.

## When the API key is rotated

The key lives in the environment only, so rotating it is an environment change and a
restart:

1. Create the new key in your service account.
2. Put it in `ECHOCALL_API_KEY` (`.env`, or your orchestrator's secret store).
3. Restart the portal. Docker Compose, from the repository root: `docker compose up -d`.
4. Open the admin overview and press the re-check. It has to say the key belongs to your
   reseller account.
5. Retire the old key at the service.

Nothing in the database refers to the key, so sessions, customers and settings are
untouched. Between the rotation and the restart the portal answers `503` on `/readyz` and
shows errors on every page that needs live data.

## When someone loses their second factor

- **A customer.** Open the portal user, clear the second factor there, and tell them to set
  it up again at the next sign-in. The step is written to the audit log.
- **Another administrator.** The same, from any account that is still an administrator.
- **The only administrator, with recovery codes.** Sign in with a recovery code instead of
  the app, then turn the second factor off and on again to get a fresh secret and a fresh
  set of codes.
- **The only administrator, without recovery codes.** Only the database can help. Stop the
  portal, then:

  ```sql
  UPDATE users SET totp_secret = NULL, totp_confirmed_at = NULL WHERE email = 'you@example.com';
  DELETE FROM two_factor_recovery_codes WHERE user_id = (SELECT id FROM users WHERE email = 'you@example.com');
  ```

  Start the portal, sign in with a link, and set the second factor up again.

## When nobody can sign in

Every way into this portal goes through a mailbox, so a mail server that has stopped
working locks everyone out at once. Whoever can reach the machine can let themselves back
in, because the same link can be printed there instead of mailed:

```bash
docker compose exec app node dist/cli/sign-in-link.js you@example.com
```

It prints one link, valid for 15 minutes and usable once, and it prints an invitation
instead for an account that has not accepted one yet. A disabled account is refused; an
address nobody here has is refused too. Nothing about the account changes, so the command
is safe to run twice.

Treat access to the machine accordingly: it is the way past the mail server, which makes
it the way past the sign-in.

## Backup and restore

The portal owns two things: its database and its environment. Usage, agents, numbers and
invoices live at the service and are never copied here.

Back up:

```bash
pg_dump --format=custom --file=portal-$(date +%F).dump "$DATABASE_URL"
cp .env portal-env-$(date +%F).bak      # keep this one somewhere else than the dump
```

Restore into an empty database:

```bash
createdb echocall_light
pg_restore --dbname="$DATABASE_URL" --clean --if-exists portal-2026-09-17.dump
```

MariaDB and MySQL commands are in [database.md](database.md).

Two rules. The dump holds session hashes, one-time token hashes and the encrypted SMTP
password and TOTP secrets, so it belongs in encrypted storage. And it is only readable together
with the `APP_SECRET` that was in use when it was written: restore the database and keep a
different secret, and the SMTP password and every second factor are lost.

## Upgrading

```bash
git fetch --tags
git checkout v0.2.0          # or: git pull, for the tip of main
docker compose up -d --build
```

Migrations run at startup, before the server listens, and a failed migration stops the
start instead of leaving half a schema. They are forward-only: the way back from a release
is the backup you took before it. Read `CHANGELOG.md` first, take a dump, then upgrade.

After the upgrade, check `/readyz` and sign in once.

## Rotating `APP_SECRET`

`APP_SECRET` is the key behind the stored SMTP password and every TOTP secret. Sessions
and one-time tokens do not depend on it, so a new secret does not sign anyone out, but:

- the stored SMTP password becomes unreadable, so enter it again in the settings;
- every second factor becomes unreadable, so every account has to set it up again (as an
  operator you can clear them, see above).

Do it when the old secret leaked, and plan both steps into the same maintenance window.
Take the SMTP password out of your password manager before you start.

## Moving the portal to another address

Set `APP_URL` to the new address and restart. It decides what the links in mails point at
and whether the session cookie is marked `Secure`, so an installation that moves from
`http` to `https` picks that up on the restart. Sessions survive a move as long as the
cookie domain does not change; when it does, everyone signs in again.

## Reading the audit log

The log lists the actor, the action, the target, the client address and the time. Worth a
look now and then:

- `auth.sign_in_failed` in a row, from one address or against one account;
- `impersonation.start` without a matching `impersonation.stop`;
- `users.two_factor_cleared` you did not do yourself;
- `settings.smtp_updated` you did not do yourself.

The client address is whatever the reverse proxy passes on, so set `TRUST_PROXY` to the
number of proxies in front of the portal. With a wrong value every entry shows the proxy.

## Mail

Environment variables win over the settings page, and the page shows them as locked when
they are set. Without any SMTP server the portal keeps working and hands you a one-time
link for every invitation and every sign-in link you send, which is a fine way to run a
portal for a handful of people who all know each other.

Keep in mind what mail now carries: with no passwords anywhere, whoever reads a person's
mailbox can sign in as them. A second factor is what puts something else in the way, which
is why the first hour above asks for one on every administrator account.

The test button in the settings sends one mail to an address you type and passes the
answer of the server on, which is usually enough to find a wrong port or a refused
authentication.

## Opening the portal to sign-ups

**Settings, Sign-up** carries one switch. It is off until you turn it on, and it cannot
be turned on before a mail server works.

**Anyone may create an account** puts a sign-up form on the sign-in page. Each sign-up
creates a customer under your reseller account at the service and a user here, exactly as
if you had invited them, and lands in the audit log as `auth.registered` with no actor.
Watch the customer list after you switch it on: every sign-up is a customer you are
responsible for at the service.

Switching it off again takes effect at once: the sign-up form disappears from the sign-in
page, and a sign-up that was started but never finished cannot be completed. Accounts
created while it was on keep working.
