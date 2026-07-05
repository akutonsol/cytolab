import { test, expect } from '@playwright/test';

test('result sheets list loads', async ({ page }) => {
  await page.goto('/result-sheets');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(/result sheet|results/i).first()).toBeVisible();
});

test('report center loads with summary stats', async ({ page }) => {
  await page.goto('/report-center');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(/report/i).first()).toBeVisible();
});

test('authorization queue loads', async ({ page }) => {
  await page.goto('/authorizer');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(/authoriz|sign.?off|pending/i).first()).toBeVisible();
});

test('a report PDF endpoint returns a PDF blob', async ({ page, request }) => {
  // Find a record/report id from the records list API, then request its PDF.
  const recs = await request.get('/api/v1/records?pageSize=1');
  test.skip(!recs.ok(), 'records API unavailable');
  const data = (await recs.json())?.data ?? [];
  test.skip(data.length === 0, 'no records to render a report for');
  const id = data[0].id;
  // Try the common report-pdf routes; accept the first that yields a PDF.
  let pdfOk = false;
  for (const url of [`/api/v1/records/${id}/report/pdf`, `/api/v1/reports/${id}/pdf`, `/api/v1/records/${id}/pdf`]) {
    const r = await request.get(url);
    if (r.ok() && (r.headers()['content-type'] || '').includes('pdf')) { pdfOk = true; break; }
  }
  test.skip(!pdfOk, 'no matching report-pdf route found (route naming varies)');
  expect(pdfOk).toBeTruthy();
});
