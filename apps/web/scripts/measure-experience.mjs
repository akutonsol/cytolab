#!/usr/bin/env node
/**
 * Experience budgets — three INDEPENDENT latency classes.
 *
 * These must never be collapsed into one number. They have different causes, different
 * owners, and different fixes, and a good score in one hides a bad score in another:
 *
 *   1. COLD STARTUP      blank → app shell painted.
 *                        Bounded by bundle size and boot. No progress bar can exist yet —
 *                        the bar is React, and React has not run. Fixing this means
 *                        shipping less JavaScript, not adding a skeleton.
 *
 *   2. ROUTE LOADING     navigation committed → meaningful content on screen.
 *                        Bounded by the route chunk and its first query. Fixed by
 *                        `loading.tsx`, Suspense, and per-screen skeletons.
 *
 *   3. INTERACTION       click → visible acknowledgement.
 *                        Bounded by nothing but our own code. Fixed by GlobalProgress,
 *                        Button `loading`, and optimistic updates. This is the only class
 *                        the user experiences as "did it hear me?".
 *
 * Sprint 8 conflated 1 and 2 once and drew the wrong conclusion (a dev-mode hard
 * navigation looked like a blank screen; in production it was a cold start). Hence this file.
 *
 * Usage:
 *   node scripts/measure-experience.mjs [--url http://localhost:3100] [--latency 1500]
 *
 * Run against a PRODUCTION build. Dev-mode numbers measure the compiler, not the product.
 */
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const BASE = arg('url', 'http://localhost:3100');
const LATENCY = Number(arg('latency', 1500)); // simulated API latency for class 2/3
const EMAIL = process.env.E2E_EMAIL ?? 'william.brooks@cytolab.demo';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Verify123!';

/**
 * Independent budgets. Changing one must not silently relax another.
 * Override individually (`--budget-interaction 1`) to prove the harness can fail — a
 * check that never fails is not a check.
 */
const BUDGET = {
  coldStartupMs: Number(arg('budget-cold', 2000)), // blank → shell. Bundle/boot bound.
  routeContentMs: Number(arg('budget-content', 400)), // commit → content, fast API.
  routeCueMs: Number(arg('budget-cue', 200)), // commit → cue, slow API. Silence is the bug.
  interactionMs: Number(arg('budget-interaction', 100)), // click → visible acknowledgement.
};

const results = [];
const record = (cls, name, value, budget, unit = 'ms') =>
  results.push({ cls, name, value, budget, pass: value !== null && value <= budget, unit });

const waitFor = async (page, fn, timeoutMs = 8000, stepMs = 10) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(fn).catch(() => false)) return Date.now() - t0;
    await page.waitForTimeout(stepMs);
  }
  return null;
};

const browser = await chromium.launch();

// ─────────────────────────────────────────────────────────────── 1. COLD STARTUP
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${BASE}/login`, { waitUntil: 'commit', timeout: 60_000 });
  const painted = await waitFor(page, () => !!document.querySelector('#login-email'), 20_000);
  record('1 cold startup', 'blank → interactive shell (login)', painted, BUDGET.coldStartupMs);
  await ctx.close();
}

// authenticated context reused by classes 2 and 3
const ctx = await browser.newContext();
const page = await ctx.newPage();

let latencyOn = false;
await page.route('**/api/v1/**', async (route) => {
  if (latencyOn) await new Promise((r) => setTimeout(r, LATENCY));
  return route.continue();
});

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForSelector('#login-email', { timeout: 30_000 });
await page.fill('#login-email', EMAIL);
await page.fill('#login-password', PASSWORD);
await page.getByRole('button', { name: 'Sign In' }).click();
await page.waitForURL('**/dashboard', { timeout: 60_000 });

// warm the route chunks so class 2 measures the product, not a one-off chunk fetch
for (const r of ['/records', '/billing']) {
  await page.goto(`${BASE}${r}`, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
}

// ──────────────────────────────────────────────────────────────── 2. ROUTE LOADING
{
  // 2a — fast API: how long until real content?
  latencyOn = false;
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  const t0 = Date.now();
  await page.goto(`${BASE}/records`, { waitUntil: 'commit' });
  const content = await waitFor(page, () => document.querySelectorAll('tbody tr').length > 0, 15_000);
  record('2 route loading', 'commit → content (fast API)', content, BUDGET.routeContentMs);

  // 2b — slow API: how long until the user is TOLD we are working?
  //      This is the class-2 guarantee. Content may be slow; silence may not.
  latencyOn = true;
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' }).catch(() => {});
  const t1 = Date.now();
  page.goto(`${BASE}/records`, { waitUntil: 'commit' }).catch(() => {});
  const cue = await waitFor(page, () => document.querySelectorAll('.skeleton-shimmer').length > 0, 15_000);
  record('2 route loading', `commit → loading cue (API +${LATENCY}ms)`, cue, BUDGET.routeCueMs);

  // and the invariant that actually matters: no confident zeros while loading
  const lied = await page.evaluate(() => {
    const t = document.body.innerText;
    return /No urgent cases|No completed turnaround data yet|Active Worklist \(0\)/.test(t);
  });
  results.push({
    cls: '2 route loading',
    name: 'no false empty state while loading',
    value: lied ? 'lied' : 'honest',
    budget: 'honest',
    pass: !lied,
    unit: '',
  });
  await page.waitForTimeout(LATENCY + 800);
}

// ───────────────────────────────────────────────────────────────── 3. INTERACTION
{
  latencyOn = true;
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(400);

  /**
   * The trigger must be deterministic and side-effect free. It must NOT depend on data
   * state: "Mark all read" is disabled once everything is read, which silently turned a
   * budget check into a no-op the first time this ran.
   *
   * The notification bell is present on every authenticated screen, is always enabled,
   * and writes nothing.
   */
  const bellIndex = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    return buttons.findIndex((b) => b.querySelector('svg') && /bell/i.test(b.outerHTML));
  });

  let ack = null;
  if (bellIndex >= 0) {
    const t0 = Date.now();
    await page.evaluate((i) => [...document.querySelectorAll('button')][i].click(), bellIndex);
    ack = await waitFor(
      page,
      () => {
        const bar = document.querySelector('[role="progressbar"]');
        if (!bar || getComputedStyle(bar).opacity === '0') return false;
        return (bar.firstElementChild?.getBoundingClientRect().width ?? 0) > 0;
      },
      5000,
      5,
    );
    if (ack !== null) ack = Date.now() - t0;
  } else {
    console.error('  ! interaction trigger (notification bell) not found — failing loudly rather than passing vacuously');
  }
  record('3 interaction', 'click → visible acknowledgement', ack, BUDGET.interactionMs);
}

await browser.close();

// ─────────────────────────────────────────────────────────────────────── report
const classes = [...new Set(results.map((r) => r.cls))];
console.log(`\nExperience budgets — ${BASE} (API latency ${LATENCY}ms where noted)\n`);
let failures = 0;
for (const cls of classes) {
  console.log(`  ${cls}`);
  for (const r of results.filter((x) => x.cls === cls)) {
    if (!r.pass) failures++;
    const val = r.value === null ? 'not observed' : `${r.value}${r.unit}`;
    const budget = typeof r.budget === 'number' ? `≤ ${r.budget}${r.unit}` : r.budget;
    console.log(`    ${r.pass ? '✅' : '❌'} ${r.name.padEnd(42)} ${String(val).padStart(12)}   (${budget})`);
  }
  console.log('');
}
console.log(failures === 0 ? '✅ all experience budgets met' : `❌ ${failures} budget(s) exceeded`);
process.exit(failures ? 1 : 0);
