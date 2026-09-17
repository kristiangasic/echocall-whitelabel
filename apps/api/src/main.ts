import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { JSON_BODY_LIMIT } from './common/http.js';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';

/** Loads a local .env file when present; hosted deployments set the environment themselves. */
function loadDotEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function bootstrap(): Promise<void> {
  loadDotEnv();
  // Validate before Nest starts so a misconfiguration prints only the readable problem list.
  const config = loadEnv(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
    bodyParser: false,
    logger: ['log', 'warn', 'error'],
  });
  app.set('trust proxy', config.trustProxy);
  // Angular emits inline style tags at runtime, so style-src needs 'unsafe-inline';
  // uploaded logos are stored as data URLs, so img-src needs data:. Plain-HTTP
  // intranet installs must not upgrade their asset requests to https.
  const baseline = helmet({
    contentSecurityPolicy: {
      directives: {
        ...(config.appUrl.startsWith('https://') ? {} : { 'upgrade-insecure-requests': null }),
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
  });
  // The embed surface is framed and scripted by customer sites; its controller
  // sets its own narrow headers instead of the portal baseline.
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith('/embed/') ? next() : baseline(req, res, next),
  );
  // The portal is often installed without a reverse proxy in front of it, so it
  // compresses its own answers: the largest script drops from around 400 KB to a
  // third of that, which is the difference between a fast and a slow first visit
  // over a phone connection.
  app.use(compression());
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz', 'embed/{*path}'] });
  app.enableShutdownHooks();
  await app.listen(config.port);
}

try {
  await bootstrap();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('Invalid configuration:')) {
    console.error(message);
    process.exit(1);
  }
  throw error;
}
