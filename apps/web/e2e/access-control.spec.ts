import { test, expect } from '@playwright/test';
import { NO_AUTH, STAFF_STATE } from './helpers';

test.describe('unauthenticated users are redirected to login', () => {
  test.use({ storageState: NO_AUTH });
  for (const path of ['/dashboard', '/patients', '/workforce', '/payroll', '/security', '/system/support']) {
    test(`${path} → /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    });
  }
});

test.describe('staff (non-superuser) is denied privileged areas', () => {
  test.use({ storageState: STAFF_STATE });

  // FINDING (real app bug): as of this run the Security Center pages render for a
  // non-superuser (no client-side permission guard / redirect). This test asserts
  // the intended secure behavior and will FAIL until a route guard is added.
  test('cannot reach the Security Center', async ({ page }) => {
    await page.goto('/security');
    // Either bounced away, or the privileged security content never renders.
    const privileged = page.getByText(/active sessions|blocked ips|open alerts|failed logins/i);
    if (/\/security/.test(page.url())) {
      await expect(privileged).toHaveCount(0);
    } else {
      await expect(page).not.toHaveURL(/\/security/);
    }
  });

  // FINDING (real app bug): the Support management page renders for a non-superuser.
  // Asserts intended secure behavior; FAILS until a route guard is added.
  test('cannot see support management tabs', async ({ page }) => {
    await page.goto('/system/support');
    await expect(page.getByText(/maintenance window|announcement|new ticket/i)).toHaveCount(0);
  });

  test('CAN reach the Knowledge Base', async ({ page }) => {
    await page.goto('/knowledge-base');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
  });

  test('CAN see the Report an Issue affordance', async ({ page }) => {
    await page.goto('/dashboard');
    // Icon button — match by accessible name.
    await expect(page.getByRole('button', { name: /report an issue/i })).toBeVisible();
  });
});

test('FeatureGate hides workforce when the flag is off', async () => {
  test.skip(true, 'WORKFORCE_MANAGEMENT is enabled lab-wide for the demo; cannot safely toggle it off in the shared DB during E2E');
});
