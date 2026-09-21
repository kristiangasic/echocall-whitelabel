# Build context is the repository root: docker build -f docker/Dockerfile .
FROM node:25-bookworm-slim AS build
# The lockfile is written by npm 12; older npm versions fail on it.
RUN npm install -g npm@12
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/echocall-api/package.json packages/echocall-api/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:25-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN npm install -g npm@12
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/echocall-api/package.json packages/echocall-api/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/packages/echocall-api/dist packages/echocall-api/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist/web/browser apps/web/dist/web/browser
ENV WEB_DIST_DIR=/app/apps/web/dist/web/browser
ENV PORT=3000
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/api/dist/main.js"]
