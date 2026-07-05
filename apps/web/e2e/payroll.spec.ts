import { test, expect } from '@playwright/test';

test('payroll dashboard loads with the hero total', async ({ page }) => {
  await page.goto('/payroll');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: /payroll/i }).first()).toBeVisible();
  await expect(page.getByText(/total gross payroll/i)).toBeVisible();
});

test('payroll engine tab lists periods', async ({ page }) => {
  await page.goto('/payroll');
  const engineTab = page.getByRole('button', { name: /payroll engine/i });
  test.skip(!(await engineTab.count()), 'Payroll Engine tab hidden (WORKFORCE_MANAGEMENT off)');
  await engineTab.click();
  await expect(page.getByRole('button', { name: /new period/i }).or(page.getByText(/no payroll periods|period/i)).first()).toBeVisible();
});

test('new period modal opens', async ({ page }) => {
  await page.goto('/payroll');
  const engineTab = page.getByRole('button', { name: /payroll engine/i });
  test.skip(!(await engineTab.count()), 'Payroll Engine tab hidden');
  await engineTab.click();
  const newBtn = page.getByRole('button', { name: /new period/i });
  test.skip(!(await newBtn.count()), 'New Period requires manager rights');
  await newBtn.click();
  await expect(page.getByText(/new payroll period|month|year/i).first()).toBeVisible();
});

test('process button triggers a confirmation dialog (no actual processing)', async ({ page }) => {
  await page.goto('/payroll');
  const engineTab = page.getByRole('button', { name: /payroll engine/i });
  test.skip(!(await engineTab.count()), 'Payroll Engine tab hidden');
  await engineTab.click();
  const process = page.getByRole('button', { name: /^process$/i }).first();
  test.skip(!(await process.count()), 'no DRAFT period to process');
  await process.click();
  await expect(page.getByText(/process payroll\?|will calculate payroll/i)).toBeVisible();
  // Cancel — do not actually run payroll during E2E.
  await page.getByRole('button', { name: /cancel/i }).click();
});
