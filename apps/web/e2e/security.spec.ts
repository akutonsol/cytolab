import { test, expect } from '@playwright/test';
import { STAFF_STATE } from './helpers';

// Superuser view of the Security Center.
test('security dashboard loads', async ({ page }) => {
  await page.goto('/security');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(/session|alert|blocked|failed login|security/i).first()).toBeVisible();
});

for (const [name, path, marker] of [
  ['active sessions', '/security/sessions', /session|device|last active/i],
  ['login history', '/security/login-history', /login|ip|success|fail/i],
  ['locked users', '/security/locked-users', /lock|unlock|user/i],
  ['blocked IPs', '/security/blocked-ips', /ip|block/i],
  ['MFA management', '/security/mfa', /mfa|totp|two-factor|authenticator/i],
] as const) {
  test(`${name} page loads`, async ({ page }) => {
    await page.goto(path);
    await expect(page).not.toHaveURL(/\/login(\?|$)/); // avoid matching /login-history
    await expect(page.getByText(marker).first()).toBeVisible();
  });
}

test('login history has a filter bar', async ({ page }) => {
  await page.goto('/security/login-history');
  await expect(page.getByPlaceholder(/search|user|ip/i).or(page.getByRole('textbox')).first()).toBeVisible();
});

test.describe('own profile security (any authenticated user)', () => {
  test.use({ storageState: STAFF_STATE });
  test('profile security page loads for staff', async ({ page }) => {
    await page.goto('/profile/security');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/session|password|mfa|two-factor|security/i).first()).toBeVisible();
  });
});
