import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
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
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { abortOnError: false });
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
