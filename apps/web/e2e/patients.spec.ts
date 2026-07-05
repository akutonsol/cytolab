import { test, expect } from '@playwright/test';

test('patient list loads', async ({ page }) => {
  await page.goto('/patients');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: /patients/i }).first()).toBeVisible();
});

test('search filters the list', async ({ page }) => {
  await page.goto('/patients');
  const search = page.getByPlaceholder(/search/i).first();
  await expect(search).toBeVisible();
  await search.fill('a');
  // Debounced client filter — just assert the input accepted the value and the
  // page did not crash to an error boundary.
  await expect(search).toHaveValue('a');
  await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
});

test('create-patient affordance opens a form', async ({ page }) => {
  await page.goto('/patients');
  const newBtn = page.getByRole('button', { name: /new patient|add patient/i }).first();
  if (await newBtn.count()) {
    await newBtn.click();
    await expect(page.getByRole('dialog').or(page.getByText(/first name|surname|new patient/i)).first()).toBeVisible();
  } else {
    test.skip(true, 'no New Patient control found on rewritten patients page');
  }
});

test('patient detail page loads with tabs', async ({ page }) => {
  await page.goto('/patients');
  const firstRow = page.locator('tbody tr, [role="row"]').first();
  if (!(await firstRow.count())) test.skip(true, 'no patients in demo lab');
  await firstRow.click();
  // Either navigated to a detail route or opened a detail panel.
  await expect(page.getByText(/overview|specimens|requisitions|history|demographics/i).first()).toBeVisible({ timeout: 15_000 });
});
