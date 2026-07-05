import { chromium, type FullConfig, type Page } from '@playwright/test';
import fs from 'node:fs';
import { AUTH_DIR, BASE, STAFF, STAFF_STATE, SUPER, SUPER_STATE } from './helpers';

// Real browser login → captures BOTH the HttpOnly auth cookies and the
// `cytolab-auth` localStorage claims the app gates rendering on. Retries once
// after the rate-limit window (login is capped at 5/min per IP) so setup is
// robust to a recently-consumed budget.
async function browserLogin(email: string, password: string, file: string): Promise<Page> {
  const browser = await chromium.launch();
  for (let attempt = 0; attempt < 2; attempt++) {
    const page = await browser.newPage({ baseURL: BASE });
    await page.goto('/login');
    await page.fill('#login-email', email);
    await page.fill('#login-password', password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    try {
      await page.waitForURL('**/dashboard', { timeout: 20_000 });
      await page.context().storageState({ path: file });
      return page; // caller may reuse page.request (shares the auth cookies)
    } catch {
      await page.close();
      if (attempt === 0) await new Promise((r) => setTimeout(r, 61_000)); // wait out rate window
      else throw new Error(`login failed for ${email} (rate limit or bad credentials)`);
    }
  }
  throw new Error('unreachable');
}

export default async function globalSetup(_config: FullConfig) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // 1) Superuser identity (keep the page to reuse its authenticated cookies).
  const suPage = await browserLogin(SUPER.email, SUPER.password, SUPER_STATE);

  // 2) Ensure a non-superuser staff user exists — via the superuser page's own
  //    request context (no extra login). Idempotent: ignore "already exists".
  const rolesRes = await suPage.request.get('/api/v1/roles?pageSize=100');
  const roles = ((await rolesRes.json()).data ?? []) as { id: string; name: string }[];
  const labTech = roles.find((r) => r.name === 'Lab Technician');
  const created = await suPage.request.post('/api/v1/users', {
    data: { email: STAFF.email, password: STAFF.password, firstName: STAFF.firstName, lastName: STAFF.lastName, roleIds: labTech ? [labTech.id] : [] },
  });
  if (!created.ok() && created.status() !== 409 && created.status() !== 400) {
    console.warn(`[global-setup] staff create returned ${created.status()}: ${await created.text()}`);
  }
  await suPage.context().browser()?.close();

  // 3) Staff identity.
  const staffPage = await browserLogin(STAFF.email, STAFF.password, STAFF_STATE);
  await staffPage.context().browser()?.close();
}
