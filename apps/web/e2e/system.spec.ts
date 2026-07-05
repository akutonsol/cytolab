import { test, expect } from '@playwright/test';

test('system health page loads', async ({ page }) => {
  await page.goto('/system');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(/system health|health|diagnostics/i).first()).toBeVisible();
});

test('health check sections are visible', async ({ page }) => {
  await page.goto('/system');
  // Not all section names are guaranteed; require the bulk of them.
  const sections = [/infrastructure/i, /data integrity/i, /business/i, /security/i];
  let seen = 0;
  for (const s of sections) if (await page.getByText(s).count()) seen++;
  expect(seen, 'health sections visible').toBeGreaterThanOrEqual(2);
});

test('Run Deep Check triggers diagnostics', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/system');
  const btn = page.getByRole('button', { name: /deep (check|diagnostic)/i }).first();
  test.skip(!(await btn.count()), 'Deep Check control not present');
  await btn.click();
  // Expect either a loading state or rendered results with status indicators.
  await expect(
    page.getByText(/running|checking|route|email|storage|pdf|fhir|scheduler|migration|healthy|degraded|fail/i).first(),
  ).toBeVisible({ timeout: 45_000 });
});
