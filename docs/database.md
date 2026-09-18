# Database

## Supported servers

| Server     | Versions | Notes                                         |
| ---------- | -------- | --------------------------------------------- |
| PostgreSQL | 14+      | Reference database; used by the Compose setup |
| MariaDB    | 10.6+    | Same schema and features                      |
| MySQL      | 8+       | Same schema and features                      |

The dialect is picked from the `DATABASE_URL` scheme: `postgres://` / `postgresql://`
select PostgreSQL, `mysql://` / `mariadb://` select the MySQL driver.

```
DATABASE_URL=postgres://light:secret@db.example.com:5432/echocall_light
DATABASE_URL=mariadb://light:secret@db.example.com:3306/echocall_light
```

TLS towards the database is controlled by `DATABASE_SSL`: `disable` (default), `require`,
or `no-verify` for servers with self-signed certificates.

The portal needs one empty database and a user with DDL rights (it creates and migrates
its own tables). It stores only accounts, sessions and tokens, settings and the audit log;
usage data stays at EchoCall.

## Migrations

Migrations are bundled with the app and run automatically at startup, before the server
starts listening; a failed migration stops the start instead of leaving half a schema. They
are forward-only - restore a backup to roll back. No manual migration step exists or is
needed, on an installation or on an upgrade.

## Backup and restore

PostgreSQL:

```bash
pg_dump --format=custom --file=portal.dump "$DATABASE_URL"
pg_restore --dbname="$DATABASE_URL" --clean --if-exists portal.dump
```

Bundled Compose database:

```bash
docker compose exec db pg_dump -U light --format=custom echocall_light > portal.dump
docker compose exec -T db pg_restore -U light --dbname=echocall_light --clean --if-exists < portal.dump
```

MariaDB / MySQL:

```bash
mariadb-dump --single-transaction echocall_light > portal.sql   # or mysqldump
mariadb echocall_light < portal.sql                             # or mysql
```

Restore with the portal stopped, then start it: migrations run at startup and bring a dump
from an older release up to the current schema.

Take a backup before every upgrade; the audit log and your branding (including the uploaded
logo) live in this database. Two things are worth knowing about a dump. It holds password
hashes, session hashes and the encrypted SMTP password and second-factor secrets, so it
belongs in encrypted storage, apart from the `.env` it was taken with. And it is only fully
readable together with that `APP_SECRET`: restore the database under a different secret and
the SMTP password and every second factor are lost - the accounts still work, the second
factor has to be set up again. [operating.md](operating.md) walks through both cases.

## Test database

The `apps/api` tests need a database server they may create and drop schemas in - never
point them at anything you care about. By default they expect PostgreSQL on
`127.0.0.1:5433` with a database `echocall_light_test`; override with
`TEST_DATABASE_URL`, which also accepts MariaDB/MySQL URLs (CI runs the suite against
both PostgreSQL and MariaDB).
