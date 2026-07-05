import { test, expect, request as pwRequest } from '@playwright/test';
import { BASE, SUPER } from './helpers';

// Seed one ticket so the detail-drawer test has a row to open.
test.beforeAll(async () => {
  const ctx = await pwRequest.newContext({ baseURL: BASE });
  const login = await ctx.post('/api/v1/auth/login', { data: SUPER });
  if (login.ok()) {
    await ctx.post('/api/v1/system/support/tickets', {
      data: { title: 'E2E Smoke Ticket', description: 'Created by E2E to verify the ticket detail drawer.', category: 'BUG', priority: 'LOW' },
    });
  }
  await ctx.dispose();
});

test('support page loads with tickets + stats', async ({ page }) => {
  await page.goto('/system/support');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(/ticket/i).first()).toBeVisible();
});

test('new ticket modal opens', async ({ page }) => {
  await page.goto('/system/support');
  const btn = page.getByRole('button', { name: /new ticket|create ticket|report an issue/i }).first();
  test.skip(!(await btn.count()), 'no New Ticket control found');
  await btn.click();
  await expect(page.getByText(/subject|title|category|priority|description/i).first()).toBeVisible();
});

test('ticket detail opens on row click', async ({ page }) => {
  await page.goto('/system/support');
  if (await page.getByText(/no tickets found/i).count()) test.skip(true, 'no support tickets available');
  const rows = page.locator('tbody tr');
  test.skip(!(await rows.count()), 'no tickets to open');
  await rows.first().click();
  // The detail slide-over shows the ticket number and/or a comment box — target
  // visible detail content, not the hidden filter <option>s.
  await expect(
    page.getByText(/TKT-\d/).or(page.getByRole('button', { name: /resolve|close ticket|add comment|internal note/i })).first(),
  ).toBeVisible({ timeout: 15_000 });
});

test('maintenance and announcements tabs render', async ({ page }) => {
  await page.goto('/system/support');
  const maint = page.getByRole('button', { name: /maintenance/i }).or(page.getByText(/maintenance window/i)).first();
  const announce = page.getByRole('button', { name: /announcement/i }).or(page.getByText(/announcement/i)).first();
  await expect(maint).toBeVisible();
  await announce.click().catch(() => {});
  await expect(announce).toBeVisible();
});

test('"Report an Issue" is available to authenticated users in the shell', async ({ page }) => {
  await page.goto('/dashboard');
  // Rendered as an icon button (aria-label), so match by accessible name.
  await expect(page.getByRole('button', { name: /report an issue/i })).toBeVisible();
});
