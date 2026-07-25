import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Real cookie login (+ localStorage claims the app gates rendering on) for the two seeded scoped
// principals, captured to storageState for the spec. Fixtures/creds come from the seeder's .fixtures.json.
export const ACCEPT_BASE = process.env.ACCEPT_BASE_URL ?? 'http://localhost:3001';
export const AUTH_DIR = path.join(__dirname, '.auth');
export const REVIEWER_STATE = path.join(AUTH_DIR, 'reviewer.json');
export const PUBLISHER_STATE = path.join(AUTH_DIR, 'publisher.json');
export const FIXTURES_PATH = path.join(__dirname, '.fixtures.json');

export function readFixtures() {
  if (!fs.existsSync(FIXTURES_PATH)) {
    throw new Error(`fixtures not found at ${FIXTURES_PATH} — run the acceptance seeder first`);
  }
  return JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8')) as {
    labId: string;
    creds: { reviewer: { email: string; password: string }; publisher: { email: string; password: string } };
    slides: { publishFlow: string; divergent: string; paginated: string };
    gens: { s1Published: string; s1Ready: string; s1QcFailed: string; s2Divergent: string; s2Ready: string };
  };
}

async function browserLogin(email: string, password: string, file: string) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL: ACCEPT_BASE });
    // Passively observe the NATURAL GET /auth/me that loadClaims() fires after a successful
    // login — we never issue our own auth request. Records only occurrence + HTTP status.
    let authMeObserved = false;
    let authMeStatus: number | null = null;
    page.on('response', (r) => {
      if (r.url().includes('/api/v1/auth/me') && r.request().method() === 'GET') {
        authMeObserved = true;
        authMeStatus = r.status();
      }
    });
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.fill('#login-email', email);
    await page.fill('#login-password', password);
    // Prove the login API call itself — surfaces 401/5xx/proxy failures precisely rather than as a blind
    // navigation timeout. Same 20s budget; no product/permission change (real scoped-principal login).
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST', { timeout: 20_000 }),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ]);
    if (!resp.ok()) {
      const body = await resp.text().catch(() => '');
      throw new Error(`login for ${email} failed: HTTP ${resp.status()} — ${body.slice(0, 200)}`);
    }
    const payload = (await resp.json().catch(() => ({}))) as { status?: string };
    if (payload.status && payload.status !== 'OK') {
      throw new Error(`login for ${email} did not complete (status=${payload.status})`);
    }
    // Prove the authenticated session established: the app hydrates claims and leaves /login.
    // On failure, emit a SECRETS-SAFE diagnostic (cookie/Set-Cookie METADATA only, never values)
    // to localize the fault, then fail closed. Same 20s budget; no replacement auth request,
    // no cookie/storage injection — the real browser flow is untouched.
    try {
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
    } catch (navErr) {
      // Cookie METADATA only (name/path/domain/secure/sameSite/expiry/value-length); values are never read out.
      const jar = await page.context().cookies().catch(() => []);
      const cookieMeta = (name: string) => {
        const c = jar.find((x) => x.name === name);
        return c
          ? { name: c.name, path: c.path, domain: c.domain, secure: c.secure, sameSite: c.sameSite, expires: c.expires, valueLength: c.value.length }
          : 'absent';
      };
      // Login-response Set-Cookie: report cookie NAMES only (substring before '='); token values redacted.
      const setCookieNames = (await resp.headersArray())
        .filter((h) => h.name.toLowerCase() === 'set-cookie')
        .map((h) => h.value.split('=')[0].trim());
      const visibleErr = await page.locator('.text-red-700').first().textContent().catch(() => null);
      const diag = {
        reason: 'did not leave /login within 20s',
        url: page.url(),
        naturalAuthMe: authMeObserved ? `observed HTTP ${authMeStatus}` : 'NOT observed',
        loginResponseSetCookieNames: setCookieNames.length ? setCookieNames : 'none',
        access_token: cookieMeta('access_token'),
        refresh_token: cookieMeta('refresh_token'),
        visibleLoginError: visibleErr ? visibleErr.trim().slice(0, 200) : 'none',
      };
      throw new Error(`login for ${email} did not navigate: ${JSON.stringify(diag, null, 2)}`);
    }
    await page.context().storageState({ path: file });
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(_config: FullConfig) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { creds } = readFixtures();
  await browserLogin(creds.reviewer.email, creds.reviewer.password, REVIEWER_STATE);
  await browserLogin(creds.publisher.email, creds.publisher.password, PUBLISHER_STATE);
}
