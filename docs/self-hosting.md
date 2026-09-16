# Self-hosting

## Docker Compose (recommended)

```bash
git clone https://github.com/echocall/echocall-light.git
cd echocall-light
cp .env.example .env
# set APP_URL, APP_SECRET, ECHOCALL_API_KEY, DB_PASSWORD
docker compose -f docker/docker-compose.yml up -d
```

This builds the image, starts a PostgreSQL container with a named volume, waits for it to
become healthy, and starts the app on port 3000. On the first visit the portal runs its
setup: it verifies the connection to EchoCall and creates your admin account.

To use your own database server instead of the bundled container, set `DATABASE_URL` in
`.env` and remove the `db` service (or use the plain Dockerfile, below).

## Plain Docker

```bash
docker build -f docker/Dockerfile -t echocall-light .
docker run -d --name portal --env-file .env -p 3000:3000 echocall-light
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

| Route      | Meaning                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/healthz` | Liveness: the process accepts requests. Always `200 {"status":"ok"}`.                                                                                     |
| `/readyz`  | Readiness: `200` when the database answers and the EchoCall connection is healthy; otherwise `503` with `{"status":"degraded","database":...,"hub":...}`. |

`/readyz` tells you _why_ the portal is degraded: `database: false` points at your
database; `hub.error.code` values like `invalid_api_key` or `no_active_subscription` point
at the EchoCall subscription or key. The Docker image wires `/healthz` into
`HEALTHCHECK`.

## Updates

```bash
git pull
docker compose -f docker/docker-compose.yml up -d --build
```

Database migrations run automatically at startup. Read [CHANGELOG.md](../CHANGELOG.md)
before major upgrades.

## Backups

Everything the portal owns lives in its database (accounts, settings including your logo,
audit log) plus your `.env`. Back up both; see [database.md](database.md) for dump
commands. Usage data is not stored locally - it always comes live from EchoCall.
