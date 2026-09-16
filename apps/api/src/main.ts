import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
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
  // The content security policy is added together with the static Angular delivery.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz'] });
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
