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
starts listening; a failed migration stops the start. They are forward-only - restore a
backup to roll back. No manual migration step exists or is needed.

## Backups

PostgreSQL:

```bash
pg_dump --format=custom --file=portal.dump "$DATABASE_URL"
pg_restore --dbname="$DATABASE_URL" --clean portal.dump
```

Bundled Compose database:

```bash
docker compose -f docker/docker-compose.yml exec db pg_dump -U light --format=custom echocall_light > portal.dump
```

MariaDB / MySQL:

```bash
mariadb-dump --single-transaction echocall_light > portal.sql   # or mysqldump
```

Take backups before upgrades; the audit log and your branding (including the uploaded
logo) live in this database.

## Test database

The `apps/api` tests need a database server they may create and drop schemas in - never
point them at anything you care about. By default they expect PostgreSQL on
`127.0.0.1:5433` with a database `echocall_light_test`; override with
`TEST_DATABASE_URL`, which also accepts MariaDB/MySQL URLs (CI runs the suite against
both PostgreSQL and MariaDB).
