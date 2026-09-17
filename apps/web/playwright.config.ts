import { defineConfig, devices } from '@playwright/test';
import { PORTAL_URL, READY_URL } from './e2e/accounts.mjs';

/**
 * The smoke run: the built portal, a stub of the service and a throwaway
 * PostgreSQL database, driven through a real browser. e2e/harness.mjs starts
 * all of it and only reports ready once both seeded accounts exist.
 *
 * Both projects run the same two paths, on a desktop window and on a phone,
 * because the portal has to work on a phone just as well.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  // The run shares one database and one stub, so the paths run one after another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: PORTAL_URL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node e2e/harness.mjs',
    url: READY_URL,
    timeout: 180_000,
    reuseExistingServer: !process.env['CI'],
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
