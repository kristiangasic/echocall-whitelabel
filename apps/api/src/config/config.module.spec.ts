import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigModule } from './config.module.js';
import { APP_CONFIG, type AppConfig } from './env.js';

const KEY = 'eck_live_' + 'b'.repeat(64);
const MANAGED = ['APP_URL', 'APP_SECRET', 'DATABASE_URL', 'ECHOCALL_API_KEY', 'PORT'] as const;

@Injectable()
class Clock {
  now(): number {
    return 42;
  }
}

@Injectable()
class Consumer {
  constructor(readonly clock: Clock) {}
}

describe('ConfigModule', () => {
  const saved: Partial<Record<(typeof MANAGED)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of MANAGED) saved[key] = process.env[key];
    process.env.APP_URL = 'https://portal.example.com';
    process.env.APP_SECRET = 'x'.repeat(40);
    process.env.DATABASE_URL = 'postgres://light:secret@db:5432/light';
    process.env.ECHOCALL_API_KEY = KEY;
    process.env.PORT = '4100';
  });

  afterEach(() => {
    for (const key of MANAGED) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('provides the validated configuration from the process environment', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule] }).compile();
    const config = moduleRef.get<AppConfig>(APP_CONFIG);
    expect(config.port).toBe(4100);
    expect(config.echocall.apiKey).toBe(KEY);
    expect(config.cookieSecure).toBe(true);
  });

  it('fails module compilation with the readable configuration error', async () => {
    process.env.APP_SECRET = 'short';
    await expect(Test.createTestingModule({ imports: [ConfigModule] }).compile()).rejects.toThrow(
      /APP_SECRET/,
    );
  });

  it('resolves constructor dependencies by type under the test transform', async () => {
    // Guards the test tool chain: Nest needs emitted decorator metadata for type-based injection.
    const moduleRef = await Test.createTestingModule({ providers: [Clock, Consumer] }).compile();
    expect(moduleRef.get(Consumer).clock.now()).toBe(42);
  });
});
