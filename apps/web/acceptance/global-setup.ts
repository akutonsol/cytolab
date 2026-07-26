import { chromium, expect, type FullConfig } from '@playwright/test';
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
    // React 18 wires the Sign-in button's onClick via root-level event delegation DURING hydration; a click
    // that lands before hydration hits an inert `type="button"` (there is no <form>) and fires NO request.
    // `domcontentloaded` does not prove hydration and `next start` hydration timing varies under CI, so a
    // single click races (Run #8 lost it). Retry the REAL click until the POST is observed, under a single
    // 20s wall-clock ceiling: toPass races each attempt against its deadline (playwright-core
    // pollAgainstDeadline → raceAgainstDeadline) and wraps the callback in try/catch (so a failed attempt
    // never escapes as an unhandled rejection); we clamp each attempt's waitForResponse + click to the
    // REMAINING budget so no in-flight wait can outlive the deadline, and settle BOTH with allSettled before
    // throwing so a rejected click can never leave the sibling waiter live into the next attempt. Each
    // attempt is short so a pre-hydration inert click fails fast and retries; an observed matching POST
    // response is accepted as success (even if the click reports a late rejection), so we never retry —
    // and never duplicate-login — after the response was seen.
    const LOGIN_BUDGET_MS = 20_000;
    const ATTEMPT_MS = 4_000;
    const deadline = Date.now() + LOGIN_BUDGET_MS;
    let captured: Awaited<ReturnType<typeof page.waitForResponse>> | undefined;
    await expect(async () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('login budget exhausted');
      const attemptMs = Math.min(ATTEMPT_MS, remaining); // always > 0 (never 0 → never an unbounded wait)
      // Register the response waiter BEFORE initiating the click, then settle BOTH before throwing/retrying,
      // so a rejected click cannot leave the sibling waiter active into the next attempt.
      const responsePromise = page.waitForResponse(
        (res) => res.url().includes('/api/v1/auth/login') && res.request().method() === 'POST',
        { timeout: attemptMs },
      );
      const clickPromise = page.getByRole('button', { name: 'Sign in' }).click({ timeout: attemptMs });
      const [responseSettled, clickSettled] = await Promise.allSettled([responsePromise, clickPromise]);
      // A fulfilled matching response proves the handler ran; accept it as success even if the click
      // reports a late rejection, so we never retry — and duplicate-login — after the POST was observed.
      if (responseSettled.status === 'fulfilled') {
        captured = responseSettled.value;
        return;
      }
      if (clickSettled.status === 'rejected') throw clickSettled.reason;
      throw responseSettled.reason;
    }).toPass({ timeout: LOGIN_BUDGET_MS });
    const resp = captured;
    if (!resp) throw new Error(`login for ${email}: no POST /api/v1/auth/login observed within 20s`);
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
