import { expect, test, type Page } from '@playwright/test';
import { CUSTOMER, OPERATOR } from './accounts.mjs';

/**
 * The two paths that have to work for the portal to be worth installing: an
 * operator takes on a customer, and that customer reaches their own workspace
 * and asks for help. Everything runs against the built portal with a stub in
 * place of the service.
 */

async function signIn(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('email').fill(account.email);
  await page.getByTestId('password').fill(account.password);
  await page.getByTestId('submit').click();
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
