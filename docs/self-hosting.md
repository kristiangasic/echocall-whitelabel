# Self-hosting

## Docker Compose (recommended)

```bash
git clone https://github.com/kristiangasic/echocall-whitelabel.git
cd echocall-whitelabel
cp .env.example .env
# set APP_URL, APP_SECRET, ECHOCALL_API_KEY, DB_PASSWORD
docker compose up -d
```

This builds the image, starts a PostgreSQL container with a named volume, waits for it to
become healthy, and starts the app on port 3000. On the first visit the portal runs its
setup: it verifies the connection to EchoCall and creates your admin account.

Run it from the repository root, where `compose.yaml` and your `.env` are: Compose reads
the `.env` next to the compose file, so calling it with a path from somewhere else leaves
every setting empty.

Port 3000 on the host is already taken on many servers. Set `HTTP_PORT` in `.env` to move
it; the container keeps its own port, so nothing else changes.

To use your own database server instead of the bundled container, set `DATABASE_URL` in
`.env` and remove the `db` service (or use the plain Dockerfile, below).

## Plain Docker

```bash
docker build -f docker/Dockerfile -t echocall-whitelabel .
docker run -d --name portal --env-file .env -p 3000:3000 echocall-whitelabel
```

The image serves the web UI, the API, and the health endpoints from one container and
runs as the unprivileged `node` user.

## Without Docker

```bash
npm install -g npm@12
npm ci
npm run build
WEB_DIST_DIR=$PWD/apps/web/dist/web/browser node apps/api/dist/main.js
```

Provide the environment (or a `.env` file) as described in
[configuration.md](configuration.md). Use a process manager (systemd, pm2) for restarts.

## Reverse proxy and TLS

Run a TLS-terminating proxy in front and keep `TRUST_PROXY=1` (the default) so the audit
log and rate limiting see real client IPs.

Caddy:

```
portal.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

nginx:

```nginx
server {
    server_name portal.example.com;
    listen 443 ssl http2;
    # ssl_certificate ...; ssl_certificate_key ...;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Health checks

| Route      | Meaning                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/healthz` | Liveness: the process accepts requests. Always `200 {"status":"ok"}`.                                                                |
| `/readyz`  | Readiness: `200` when the database answers and the EchoCall connection is healthy; otherwise `503` with `{"status":"degraded",...}`. |

Both routes are open, so an orchestrator can use them without a credential. That is why
`/readyz` says _whether_, not _why_: it reports `database` as a boolean and the EchoCall
connection as `{ "ok": false, "checkedAt": ... }`, and nothing about the key or the account
behind it. The reason is one sign-in away, in the admin overview, and in the server log,
which writes one line with the reason code whenever the connection changes state:
`invalid_api_key`, `no_active_subscription`, `key_not_reseller` or `upstream_unavailable`.
[operating.md](operating.md) lists what each of them means.

The Docker image wires `/healthz` into `HEALTHCHECK`. Block both routes at the proxy if
they should not be reachable from the internet.

## Updates

```bash
git fetch --tags
git checkout v0.2.0          # or: git pull, for the tip of main
docker compose up -d --build
```

Take a database dump first. Migrations run at startup, before the server listens, and a
failed migration stops the start instead of leaving half a schema; they are forward-only,
so the way back from a release is that dump. Read [CHANGELOG.md](../CHANGELOG.md) before
you upgrade, then check `/readyz` and sign in once afterwards.

## Backups

Everything the portal owns lives in its database (accounts, settings including your logo,
audit log) plus your `.env`. Back up both, and keep them apart: the dump is only fully
readable together with the `APP_SECRET` from that `.env`, which is exactly why the two do
not belong in one archive.

```bash
pg_dump --format=custom --file=portal-$(date +%F).dump "$DATABASE_URL"
```

Restore commands for every supported server are in [database.md](database.md); the day to
day of running the portal is in [operating.md](operating.md). Usage data is not stored
locally - it always comes live from EchoCall.
