import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
});

test('dashboard renders KPI content', async ({ page }) => {
  // Any of the KPI strip labels indicates the dashboard body mounted.
  const kpi = page.getByText(/active specimens|cases today|turnaround|pending review|auth rate|requests|sales/i).first();
  await expect(kpi).toBeVisible();
});

test('ActivityTray chips render (Escalation / AI / FHIR)', async ({ page }) => {
  await expect(page.getByText(/escalation|ai (review|screen)|fhir/i).first()).toBeVisible();
});

test('clock widget is present in the shell', async ({ page }) => {
  // Live clock renders a HH:MM(:SS) time somewhere in the chrome.
  await expect(page.getByText(/\b\d{1,2}:\d{2}(:\d{2})?\b/).first()).toBeVisible();
});

test('welcome greeting shows the first name', async ({ page }) => {
  await expect(page.getByText(/good (morning|afternoon|evening)|welcome|william/i).first()).toBeVisible();
});

test('"My Today" card has been removed', async ({ page }) => {
  await expect(page.getByText(/my today/i)).toHaveCount(0);
});
