/**
 * Takes the pictures the README and the documentation show.
 *
 * It starts the same harness a smoke run uses, but in demo mode: the portal is
 * seeded with the invented customers of demo-data.mjs and the service stub
 * answers with their balances and calls. Nothing here reaches a real service or
 * a real installation, so the pictures can be rebuilt by anyone at any time:
 *
 *   npm run screenshots
 *
 * The files land in docs/images and replace whatever was there.
 */
import { spawn, execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { DEMO_SIGNED_IN } from './demo-data.mjs';
import { OPERATOR, PORTAL_ENV, PORTAL_URL, READY_URL } from './accounts.mjs';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outputDir = resolve(repoRoot, 'docs/images');
const signInLinkCommand = resolve(here, '../../api/dist/cli/sign-in-link.js');

/** Wide enough for the admin panel's tables, short enough to stay readable. */
const VIEWPORT = { width: 1440, height: 900 };

/** The pictures to take, in the order a reader meets them. */
const SHOTS = [
  { file: 'admin-overview.png', as: 'operator', path: '/admin' },
  { file: 'admin-customers.png', as: 'operator', path: '/admin/customers' },
  { file: 'customer-dashboard.png', as: 'customer', path: '/app' },
  { file: 'customer-conversations.png', as: 'customer', path: '/app/conversations' },
];

function fail(message) {
  console.error(`Screenshots: ${message}`);
  process.exit(1);
}

async function waitForHarness() {
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const response = await fetch(READY_URL);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) fail('the harness did not become ready in time');
    await new Promise((done) => setTimeout(done, 300));
  }
}

/** Signs in the only way the portal allows, with a one-time link. */
async function signIn(page, email) {
  const { stdout } = await run(process.execPath, [signInLinkCommand, email], {
    cwd: here,
    env: { ...process.env, ...PORTAL_ENV },
  });
  const link = stdout.trim().split('\n').pop()?.trim();
  if (!link?.includes('/sign-in?token=')) fail(`no sign-in link printed for ${email}: ${stdout}`);
  await page.goto(link, { waitUntil: 'networkidle' });
}

/** Stops the harness and, on Windows, the portal it started. */
function stopHarness(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

mkdirSync(outputDir, { recursive: true });

const harness = spawn(process.execPath, [resolve(here, 'harness.mjs')], {
  cwd: here,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, SMOKE_DEMO: '1' },
});

let browser;
try {
  await waitForHarness();
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await context.newPage();

  let signedInAs = null;
  for (const shot of SHOTS) {
    if (signedInAs !== shot.as) {
      await signIn(page, shot.as === 'operator' ? OPERATOR.email : DEMO_SIGNED_IN.email);
      signedInAs = shot.as;
    }
    await page.goto(`${PORTAL_URL}${shot.path}`, { waitUntil: 'networkidle' });
    // Angular renders the data after the first paint, and Material ripples fade.
    await page.waitForTimeout(700);
    await page.screenshot({ path: resolve(outputDir, shot.file) });
    console.log(`docs/images/${shot.file}`);
  }
} finally {
  await browser?.close();
  stopHarness(harness);
}
