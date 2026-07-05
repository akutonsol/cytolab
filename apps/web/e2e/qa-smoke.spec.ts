import { test, expect } from '@playwright/test';

// PHASE 1 — Application smoke test. Visits every static route as superuser and
// records console errors, uncaught page errors, and 5xx responses. Non-failing
// per route (collects everything), then asserts a clean aggregate at the end.
const ROUTES = [
  '/dashboard', '/patients', '/specimens', '/requisitions', '/clients', '/lab-codes',
  '/workforce', '/workforce/timesheets', '/workforce/schedule', '/workforce/leave',
  '/workforce/overtime', '/workforce/reports', '/workforce/productivity', '/workforce/performance',
  '/payroll', '/knowledge-base', '/knowledge-base/articles',
  '/system', '/system/support', '/system/logs',
  '/security', '/security/sessions', '/security/login-history', '/security/locked-users',
  '/security/blocked-ips', '/security/mfa',
  '/settings', '/settings/features', '/profile/security',
];

type Row = { route: string; consoleErrors: string[]; pageErrors: string[]; http5xx: string[]; errorBoundary: boolean };
const results: Row[] = [];

test('phase 1 — smoke every route', async ({ page }) => {
  test.setTimeout(180_000);
  for (const route of ROUTES) {
    const row: Row = { route, consoleErrors: [], pageErrors: [], http5xx: [], errorBoundary: false };
    const onConsole = (m: any) => { if (m.type() === 'error') row.consoleErrors.push(m.text().slice(0, 160)); };
    const onPageError = (e: Error) => row.pageErrors.push(e.message.slice(0, 160));
    const onResponse = (r: any) => { if (r.status() >= 500) row.http5xx.push(`${r.status()} ${r.url().replace('http://localhost:3000', '')}`); };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.goto(route, { waitUntil: 'networkidle', timeout: 20_000 });
      await page.waitForTimeout(600); // let client fetches settle
      row.errorBoundary = (await page.getByText(/something went wrong|application error|unhandled|error boundary/i).count()) > 0;
    } catch (e: any) {
      row.pageErrors.push(`navigation: ${String(e?.message).slice(0, 120)}`);
    }
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
    results.push(row);
  }

  // Emit a compact report line per route for the QA log.
  console.log('\n===== PHASE 1 SMOKE RESULTS =====');
  for (const r of results) {
    const bad = r.consoleErrors.length + r.pageErrors.length + r.http5xx.length + (r.errorBoundary ? 1 : 0);
    const flag = bad === 0 ? 'OK  ' : 'FAIL';
    console.log(`${flag} ${r.route}  consoleErr=${r.consoleErrors.length} pageErr=${r.pageErrors.length} http5xx=${r.http5xx.length} boundary=${r.errorBoundary}`);
    if (r.pageErrors.length) console.log(`      pageErrors: ${r.pageErrors.join(' | ')}`);
    if (r.http5xx.length) console.log(`      5xx: ${r.http5xx.join(' | ')}`);
    if (r.consoleErrors.length) console.log(`      console: ${r.consoleErrors.slice(0, 3).join(' | ')}`);
  }

  // Hard failures = page crashes / 5xx / error boundary (console noise is reported, not failed).
  const crashed = results.filter((r) => r.pageErrors.length || r.http5xx.length || r.errorBoundary);
  expect(crashed.map((r) => r.route), 'routes with crash/5xx/error-boundary').toEqual([]);
});
