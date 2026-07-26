import { chromium, expect, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// ── Secrets-safe URL/path reducers for the login diagnostic below (origin+pathname only; query/hash dropped).
//    Message redaction is CREDENTIAL-AWARE and defined per-login (it needs the actual creds as redaction inputs). ──
const MAX_DIAG_LEN = 200;
function safeUrl(u: string): string {
  try { const url = new URL(u); return url.origin + url.pathname; } catch { return u.split('?')[0].split('#')[0].slice(0, MAX_DIAG_LEN); }
}
function safePathname(u: string): string {
  try { return new URL(u).pathname; } catch { return u.split('?')[0].split('#')[0].slice(0, MAX_DIAG_LEN); }
}

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
    // ── Login diagnostics: passive observers registered BEFORE navigation (metadata only). Consumed ONLY
    //    if the login retry below fails (see its catch); never alters the flow. ──
    // Credential-aware redactor: the real email/password are used ONLY as redaction INPUTS (never emitted).
    // Replaces exact credential occurrences AND email-address patterns, plus URLs and long tokens; caps length.
    const creds = [email, password].filter((c) => typeof c === 'string' && c.length >= 3);
    const redactLine = (line: string): string => {
      let out = line ?? '';
      for (const c of creds) out = out.split(c).join('[credential]');
      return out
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
        .replace(/https?:\/\/[^\s'"]+/gi, '[url]')
        .replace(/[A-Za-z0-9._~+/-]{24,}={0,2}/g, '[token]');
    };
    const redactMessage = (s: string): string => redactLine((s ?? '').split('\n')[0]).slice(0, MAX_DIAG_LEN);
    // Multiline variant for the Playwright click CALL LOG — its actionability trace is the key signal, so we
    // keep every line (each redacted) and cap the whole thing rather than discarding after the first newline.
    const redactMultiline = (s: string, max = 1500): string => (s ?? '').split('\n').map(redactLine).join('\n').slice(0, max);
    const redactReason = (e: unknown): string => {
      const err = e as { name?: string; message?: string };
      return `${err?.name ?? 'Error'}: ${redactMessage(err?.message ?? String(e))}`;
    };
    const redactReasonMultiline = (e: unknown): string => {
      const err = e as { name?: string; message?: string };
      return `${err?.name ?? 'Error'}: ${redactMultiline(err?.message ?? String(e))}`;
    };
    const attempts: Array<{ response: string; responseReason?: string; click: string; clickReason?: string }> = [];
    let loginPostCount = 0; // exact POST /api/v1/auth/login
    const authLoginReqs: Array<{ method: string; path: string }> = []; // any request whose pathname ends /auth/login
    const failedScripts: Array<{ path: string; reason: string }> = [];
    const authLoginFailures: string[] = [];
    const navPaths: string[] = [];
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('request', (req) => {
      let pathname = '';
      try { pathname = new URL(req.url()).pathname; } catch { pathname = req.url().split('?')[0]; }
      if (pathname.endsWith('/auth/login')) {
        authLoginReqs.push({ method: req.method(), path: pathname });
        if (req.method() === 'POST' && pathname === '/api/v1/auth/login') loginPostCount++;
      }
    });
    page.on('requestfailed', (req) => {
      let pathname = '';
      try { pathname = new URL(req.url()).pathname; } catch { pathname = req.url().split('?')[0]; }
      const reason = redactMessage(req.failure()?.errorText ?? 'unknown');
      if (pathname.includes('/_next/static') || pathname.endsWith('.js')) failedScripts.push({ path: pathname, reason });
      if (pathname.endsWith('/auth/login')) authLoginFailures.push(reason);
    });
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navPaths.push(safePathname(frame.url())); });
    page.on('pageerror', (err) => { pageErrors.push(redactReason(err)); });
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(redactMessage(msg.text())); });
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
    // attempt's ceiling restores the acceptance config's existing 10s actionability budget (actionTimeout:
    // 10_000) — the same budget the click had in the runs that passed — so a click that needs several
    // seconds to become actionable (CI animation/main-thread load) is not cut off prematurely; a
    // pre-hydration inert click still rejects within the attempt and retries. An observed matching POST
    // response is accepted as success (even if the click reports a late rejection), so we never retry —
    // and never duplicate-login — after the response was seen.
    const LOGIN_BUDGET_MS = 20_000;
    const ATTEMPT_MS = 10_000; // per-attempt ceiling = the config's actionTimeout (10s); clamped below to the remaining budget
    const deadline = Date.now() + LOGIN_BUDGET_MS;
    let captured: Awaited<ReturnType<typeof page.waitForResponse>> | undefined;
    try {
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
        // Diagnostic-only observation (does NOT affect the decision below): record each attempt's outcome.
        attempts.push({
          response: responseSettled.status,
          responseReason: responseSettled.status === 'rejected' ? redactReason(responseSettled.reason) : undefined,
          click: clickSettled.status,
          // Click rejections carry Playwright's multiline actionability call log — preserve it (every line
          // redacted), unlike the single-line response-timeout reason above.
          clickReason: clickSettled.status === 'rejected' ? redactReasonMultiline(clickSettled.reason) : undefined,
        });
        // A fulfilled matching response proves the handler ran; accept it as success even if the click
        // reports a late rejection, so we never retry — and duplicate-login — after the POST was observed.
        if (responseSettled.status === 'fulfilled') {
          captured = responseSettled.value;
          return;
        }
        if (clickSettled.status === 'rejected') throw clickSettled.reason;
        throw responseSettled.reason;
      }).toPass({ timeout: LOGIN_BUDGET_MS });
    } catch (loginErr) {
      // The login retry exhausted its 20s budget with no matching POST captured. Emit a SECRETS-SAFE,
      // metadata-only diagnostic (lengths/booleans/counts/sanitized paths — never values, tokens, request
      // or response bodies, raw headers, or raw URLs) to localize the cause, then FAIL CLOSED by re-throwing.
      const dom = await page.evaluate(() => {
        const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
        const srcs = (Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[])
          .map((s) => s.getAttribute('src') || '')
          .filter((s) => s.includes('_next/static'));
        const toPath = (src: string) => { try { return new URL(src, location.href).pathname; } catch { return src.split('?')[0]; } };
        return {
          emailLen: val('login-email').length,
          passwordLen: val('login-password').length,
          readyState: String(document.readyState),
          nextScriptCount: srcs.length,
          nextScriptPaths: srcs.map(toPath).slice(0, 20),
        };
      }).catch(() => ({ emailLen: -1, passwordLen: -1, readyState: 'unavailable', nextScriptCount: -1, nextScriptPaths: [] as string[] }));
      const signIn = page.getByRole('button', { name: 'Sign in' });
      // Actionability probe: resolve the button element and read layout/stacking/animation metadata that
      // explains why click actionability never settles. Two consecutive rAF bounding-box samples detect
      // continuous movement without any arbitrary sleep. Metadata only — no values.
      const actionability = await signIn
        .evaluate(async (btn) => {
          const round = (n: number) => Math.round(n * 100) / 100;
          const box = () => {
            const b = btn.getBoundingClientRect();
            return { x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height) };
          };
          const raf = () => new Promise<void>((res) => requestAnimationFrame(() => res()));
          await raf(); const sample1 = box();
          await raf(); const sample2 = box();
          const boxesDiffer =
            sample1.x !== sample2.x || sample1.y !== sample2.y || sample1.width !== sample2.width || sample1.height !== sample2.height;
          const meta = (el: Element | null) =>
            el ? { tag: el.tagName.toLowerCase(), id: el.id || null, className: (typeof el.className === 'string' ? el.className : '').slice(0, 120) } : null;
          const styleOf = (el: Element) => {
            const c = getComputedStyle(el);
            return { pointerEvents: c.pointerEvents, visibility: c.visibility, opacity: c.opacity, transform: c.transform === 'none' ? 'none' : 'set', animationName: c.animationName, animationPlayState: c.animationPlayState };
          };
          const rect = btn.getBoundingClientRect();
          const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          const ancestorStyles: Array<Record<string, unknown>> = [];
          for (let el = btn.parentElement; el; el = el.parentElement) {
            ancestorStyles.push({ ...meta(el), ...styleOf(el) });
            if (el === document.body || ancestorStyles.length >= 15) break;
          }
          const chain: Element[] = [];
          for (let el: Element | null = btn; el; el = el.parentElement) { chain.push(el); if (el === document.body) break; }
          const anims = typeof document.getAnimations === 'function' ? document.getAnimations() : [];
          const affecting = anims
            .filter((a) => { const t = (a.effect as unknown as { target?: Element } | null)?.target; return !!t && chain.includes(t); })
            .slice(0, 20)
            .map((a) => {
              const t = (a.effect as unknown as { target?: Element } | null)?.target ?? null;
              return { target: t ? t.tagName.toLowerCase() : null, id: (t && t.id) || null, name: (a as unknown as { animationName?: string }).animationName ?? (a.id || 'animation'), playState: a.playState };
            });
          return {
            boundingBox: box(),
            rafSample1: sample1,
            rafSample2: sample2,
            boxesDiffer,
            elementFromPointCenter: meta(top),
            topIsButtonOrDescendant: !!top && (top === btn || btn.contains(top)),
            buttonStyles: styleOf(btn),
            ancestorStyles,
            runningAnimationsGlobal: anims.filter((a) => a.playState === 'running').length,
            totalAnimationsGlobal: anims.length,
            animationsAffectingButtonOrAncestors: affecting,
          };
        })
        .catch(() => ({ error: 'actionability probe failed (button not resolvable)' }));
      const diag = {
        phase: 'login-retry-exhausted',
        clickAttempts: attempts.length,
        attemptResults: attempts,
        emailValueLength: dom.emailLen, // length only — never the value
        passwordValueLength: dom.passwordLen, // length only — never the value
        emailValidationVisible: await page.getByText('Enter your email or username').isVisible().catch(() => false),
        passwordValidationVisible: await page.getByText('Enter your password').isVisible().catch(() => false),
        loginErrorBannerVisible: await page.locator('.text-red-700').first().isVisible().catch(() => false),
        button: {
          visible: await signIn.isVisible().catch(() => false),
          enabled: await signIn.isEnabled().catch(() => false),
          ariaBusy: await signIn.getAttribute('aria-busy').catch(() => null),
          label: ((await signIn.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
        },
        documentReadyState: dom.readyState,
        nextStaticScriptCount: dom.nextScriptCount,
        nextStaticScriptPaths: dom.nextScriptPaths,
        failedScriptRequests: failedScripts,
        loginPostRequestCount: loginPostCount,
        authLoginRequests: authLoginReqs,
        authLoginRequestFailures: authLoginFailures,
        url: safeUrl(page.url()),
        navigationPath: navPaths,
        pageErrors,
        consoleErrors,
        actionability,
      };
      console.error(`login retry failed: ${JSON.stringify(diag, null, 2)}`);
      throw loginErr;
    }
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
