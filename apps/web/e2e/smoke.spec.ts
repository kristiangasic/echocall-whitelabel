import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { CUSTOMER, OPERATOR, PORTAL_ENV } from './accounts.mjs';

/**
 * The two paths that have to work for the portal to be worth installing: an
 * operator takes on a customer, and that customer reaches their own workspace
 * and asks for help. Everything runs against the built portal with a stub in
 * place of the service.
 */

const run = promisify(execFile);
// Playwright compiles the config and the specs to CommonJS, so this file is
// reached through require() and `import.meta` is a syntax error in it. The
// directory therefore comes from __dirname, which that loader does define.
const here = __dirname;
const signInLinkCommand = resolve(here, '../../api/dist/cli/sign-in-link.js');

/**
 * Signs in the way the portal allows: with a one-time link. The run has no mail
 * server, so the link comes from the command an operator uses on the machine
 * itself, which mints exactly the link the mail would have carried.
 */
async function signIn(page: Page, account: { email: string }): Promise<void> {
  const { stdout } = await run(process.execPath, [signInLinkCommand, account.email], {
    cwd: here,
    env: { ...process.env, ...PORTAL_ENV },
  });
  const link = stdout.trim().split('\n').pop()?.trim();
  if (!link?.includes('/sign-in?token=')) throw new Error(`No sign-in link printed: ${stdout}`);
  await page.goto(link);
}

test('an operator signs in, creates a customer and finds it in the list', async ({ page }) => {
  const email = `neu-${Date.now()}@customer.test`;

  await signIn(page, OPERATOR);
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto('/admin/customers');
  await page.getByTestId('create').click();
  await page.getByTestId('email').fill(email);
  await page.getByTestId('company').fill('Sturm Gebaeudetechnik');
  await page.getByTestId('submit').click();

  // Without a mail server the portal hands the invitation over as a link.
  await expect(page.getByTestId('one-time-link')).toContainText('/accept-invite?token=');
  await page.keyboard.press('Escape');

  await expect(page.getByTestId('customers-table')).toContainText(email);
});

test('a customer signs in, sees the dashboard and saves a support request', async ({ page }) => {
  const subject = `Rufnummer klingelt nicht ${Date.now()}`;

  await signIn(page, CUSTOMER);
  await expect(page).toHaveURL(/\/app$/);
  // The tiles carry what the service reports for this customer.
  await expect(page.getByTestId('tiles')).toContainText('42');

  await page.goto('/app/tickets');
  await page.getByTestId('ticket-create').click();
  await page.getByTestId('ticket-subject').fill(subject);
  await page.getByTestId('ticket-description').fill('Seit gestern kommt kein Anruf an.');
  await page.getByTestId('ticket-save').click();

  await expect(page).toHaveURL(/\/app\/tickets\/ticket_\d+$/);
  await expect(page.getByTestId('ticket-description')).toContainText('Seit gestern kommt kein Anruf an.');

  // The request was saved, not only shown: it is in the list on the way back.
  await page.goto('/app/tickets');
  await expect(page.getByTestId('tickets-table')).toContainText(subject);
});
