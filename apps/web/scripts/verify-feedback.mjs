/**
 * Sprint 10 — feedback-system browser verification.
 *
 * Drives real toasts through the Report-an-issue control (chrome-wide; calls
 * notify.error / notify.success directly) and checks the six accessibility +
 * zero-orange guarantees against the LIVE, THEMED antd message holder.
 *
 * Run against a production build on :3100 with the API up on :4000.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3100';
const EMAIL = process.env.E2E_EMAIL ?? 'william.brooks@cytolab.demo';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Verify123!';

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); };

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('#login-email', EMAIL);
await page.fill('#login-password', PASSWORD);
await page.getByRole('button', { name: 'Sign In' }).click();
await page.waitForURL('**/dashboard', { timeout: 60_000 });

const openTicket = async () => {
  await page.getByRole('button', { name: 'Report an issue' }).click();
  await page.getByPlaceholder('Brief summary of the issue').fill('Feedback system verification');
  await page.getByPlaceholder(/What happened/).fill('Automated Sprint 10 check.');
};

// ─────────────────────────────────────────── 1. ERROR toast: forced 500
{
  // (The <100ms interaction ack is owned by GlobalProgress and verified in
  //  measure:experience; this suite covers the feedback-specific guarantees.)
  await page.route('**/system/support/tickets', (r) =>
    r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Server exploded"}' }));
  await openTicket();
  await page.getByRole('button', { name: 'Submit Ticket' }).click();
  await page.waitForSelector('.ant-message-error', { timeout: 5000 });

  // aria-live polarity: an error must be assertive
  const live = await page.getAttribute('.ant-message', 'aria-live');
  check('error → aria-live="assertive"', live === 'assertive', `aria-live=${live}`);
  const atomic = await page.getAttribute('.ant-message', 'aria-atomic');
  check('aria-atomic="false" (no whole-region re-read)', atomic === 'false', `aria-atomic=${atomic}`);

  // no-duplicate-SR: click 3 more times, still exactly one node (dedupe by key)
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Submit Ticket' }).click();
  await page.waitForTimeout(300);
  const nErr = await page.locator('.ant-message-error').count();
  check('duplicate submits collapse to one toast (dedupe by key)', nErr === 1, `${nErr} nodes`);

  // screenshot the error toast for the orange detector
  await page.locator('.ant-message').screenshot({ path: '/tmp/toast-error.png' });

  // Escape dismisses everything
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const after = await page.locator('.ant-message-error').count();
  check('Escape dismisses the toast', after === 0, `${after} after Escape`);
  await page.unroute('**/system/support/tickets');
  await page.reload({ waitUntil: 'networkidle' });
}

// ─────────────────────────────────────────── 2. SUCCESS toast: real 200
{
  await openTicket();
  await page.getByRole('button', { name: 'Submit Ticket' }).click();
  await page.waitForSelector('.ant-message-success', { timeout: 8000 });
  const live = await page.getAttribute('.ant-message', 'aria-live');
  check('success → aria-live="polite"', live === 'polite', `aria-live=${live}`);
  await page.locator('.ant-message').screenshot({ path: '/tmp/toast-success.png' });
}

await browser.close();

// ─────────────────────────────────────────── report
let fail = 0;
console.log('\n════ FEEDBACK SYSTEM — a11y & timing ════');
for (const r of results) {
  if (!r.pass) fail++;
  console.log(`  ${r.pass ? '✅' : '❌'} ${r.name.padEnd(52)} ${r.detail}`);
}
console.log(fail ? `\n❌ ${fail} check(s) failed` : '\n✅ all feedback checks passed');
process.exit(fail ? 1 : 0);
