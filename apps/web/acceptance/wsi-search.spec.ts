import { test, expect, type Request } from '@playwright/test';
import { readSearchFixtures, SEARCHER_STATE } from './wsi-search-global-setup';

/**
 * P5-5 — slide discovery (metadata & indexing / search) acceptance.
 *
 * Proves server-side search/filter/sort/pagination over authoritative slide metadata, truthful lifecycle
 * (viewability ONLY for a published generation), tenant isolation, and that discovery (`record:view`) is
 * NOT image-delivery authority (`wsi:view` remains independently required). Driven as the Lab-A searcher.
 */
test.use({ storageState: SEARCHER_STATE });

const idsOf = (r: any) => (r.data as any[]).map((s) => s.id);

test('API: search / filters / lifecycle truth / pagination / sort / tenant isolation / authorization', async ({ request, baseURL }) => {
  const fx = readSearchFixtures();
  const api = `${baseURL}/api/v1/wsi`;
  const get = async (params: Record<string, string | number>) => (await request.get(api, { params })).json();

  // Baseline — exactly the seeded Lab-A total, paginated at 20.
  const base = await get({});
  expect(base.total).toBe(fx.totalA);
  expect(base.data.length).toBe(20);
  expect(base.totalPages).toBe(2);

  // ── Search correctness (exact) ──
  const uniq = await get({ q: fx.search.uniquePatient });
  expect(uniq.total).toBe(1);
  expect(uniq.data[0].id).toBe(fx.slides.unique);

  // ── Filters (each) ──
  expect((await get({ status: 'READY' })).data.map((s: any) => s.id)).toEqual([fx.slides.ready]);
  expect((await get({ status: 'PUBLISHED' })).data.map((s: any) => s.id)).toEqual([fx.slides.published]);
  expect((await get({ status: 'PROCESSING' })).data.map((s: any) => s.id)).toEqual([fx.slides.processing]);
  expect((await get({ status: 'QC_FAILED' })).data.map((s: any) => s.id)).toEqual([fx.slides.qcFailed]);
  expect((await get({ status: 'DRAFT' })).total).toBe(fx.totalA - 4); // all but processing/ready/qc/published
  expect((await get({ format: 'svs' })).data.map((s: any) => s.id)).toEqual([fx.slides.ready]);
  expect((await get({ tileSourceType: 'DICOMWEB' })).data.map((s: any) => s.id)).toEqual([fx.slides.published]);
  expect((await get({ stain: fx.search.uniqueStainFilter })).data.map((s: any) => s.id)).toEqual([fx.slides.unique]);
  // Combination: published AND stain H&E → the published exemplar.
  expect((await get({ status: 'PUBLISHED', stain: 'H&E' })).data.map((s: any) => s.id)).toEqual([fx.slides.published]);

  // ── Lifecycle truth (derived from authoritative generation state) ──
  const ready = (await get({ status: 'READY' })).data[0];
  expect(ready.lifecycle).toEqual({ state: 'READY', viewable: false }); // sealed+verified but UNPUBLISHED → not viewable
  const pub = (await get({ status: 'PUBLISHED' })).data[0];
  expect(pub.lifecycle).toEqual({ state: 'PUBLISHED', viewable: true }); // viewable derives from the published generation
  expect((await get({ status: 'PROCESSING' })).data[0].lifecycle.viewable).toBe(false);
  expect((await get({ status: 'QC_FAILED' })).data[0].lifecycle.viewable).toBe(false);
  // No result must leak storage internals.
  expect(JSON.stringify(base)).not.toContain('slideUrl');
  expect(JSON.stringify(base)).not.toContain('storageKey');

  // ── Pagination (deterministic; no dup, no omission) ──
  const p1 = await get({ page: 1, pageSize: 20, sort: 'newest' });
  const p2 = await get({ page: 2, pageSize: 20, sort: 'newest' });
  expect(p1.total).toBe(25); expect(p2.total).toBe(25);
  expect(p1.data.length).toBe(20); expect(p2.data.length).toBe(5);
  const union = new Set([...idsOf(p1), ...idsOf(p2)]);
  expect(union.size).toBe(25); // 20 + 5, no duplicates across pages
  expect(idsOf(p1).some((id: string) => idsOf(p2).includes(id))).toBe(false);

  // ── Sort (newest default vs oldest) ──
  const newest = await get({ sort: 'newest', pageSize: 25 });
  const oldest = await get({ sort: 'oldest', pageSize: 25 });
  expect(newest.data[0].id).toBe(fx.slides.unique); // highest uploadedAt
  expect(newest.data[0].id).not.toBe(oldest.data[0].id);
  expect(new Date(newest.data[0].uploadedAt).getTime()).toBeGreaterThanOrEqual(new Date(newest.data[24].uploadedAt).getTime());
  expect(new Date(oldest.data[0].uploadedAt).getTime()).toBeLessThanOrEqual(new Date(oldest.data[24].uploadedAt).getTime());

  // ── Tenant isolation — Lab A can never discover Lab B ──
  expect((await get({ q: fx.crossLab.patient })).total).toBe(0);
  expect((await get({ stain: fx.crossLab.stain })).total).toBe(0);

  // ── Authorization — discovery works (record:view); delivery is NOT granted (wsi:view required) ──
  const forcedDelivery = await request.post(`${baseURL}/api/v1/wsi/slides/${fx.slides.published}/delivery-session`);
  expect(forcedDelivery.status(), 'searcher lacks wsi:view → no delivery session even for a published slide').toBe(403);
});

test('UI: search / filter / sort / pagination controls request backend-grounded results', async ({ page, baseURL }) => {
  const fx = readSearchFixtures();
  const reqs: string[] = [];
  page.on('request', (r: Request) => { if (r.url().includes('/api/v1/wsi') && r.method() === 'GET') reqs.push(r.url()); });
  const listReqs = () => reqs.filter((u) => /\/api\/v1\/wsi(\?|$)/.test(u.split('#')[0]));

  await page.goto('/wsi');
  await expect(page.getByTestId('wsi-slide-rows')).toBeVisible();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="wsi-slide-row"]').length > 0);

  // Free-text search → a backend GET with q, exactly one backend-grounded row.
  await page.getByTestId('wsi-search').fill(fx.search.uniquePatient);
  await page.waitForResponse((r) => r.url().includes('/api/v1/wsi') && r.url().includes(`q=${fx.search.uniquePatient}`) && r.status() === 200);
  await expect(page.getByTestId('wsi-slide-row')).toHaveCount(1);
  await expect(page.getByTestId('wsi-result-count')).toHaveText('1 slide');

  // Status filter → backend GET; truthful viewability on the badge.
  await page.getByTestId('wsi-search').fill('');
  await page.getByTestId('wsi-filter-status').selectOption('PUBLISHED');
  await page.waitForResponse((r) => r.url().includes('/api/v1/wsi') && r.url().includes('status=PUBLISHED') && r.status() === 200);
  await expect(page.getByTestId('wsi-slide-row')).toHaveCount(1);
  await expect(page.getByTestId('wsi-lifecycle')).toHaveAttribute('data-viewable', 'true');

  await page.getByTestId('wsi-filter-status').selectOption('READY');
  await page.waitForResponse((r) => r.url().includes('/api/v1/wsi') && r.url().includes('status=READY') && r.status() === 200);
  await expect(page.getByTestId('wsi-lifecycle')).toHaveAttribute('data-viewable', 'false'); // READY is never viewable

  // Sort → backend GET with sort=oldest.
  await page.getByTestId('wsi-filter-status').selectOption('');
  await page.getByTestId('wsi-sort').selectOption('oldest');
  await page.waitForResponse((r) => r.url().includes('/api/v1/wsi') && r.url().includes('sort=oldest') && r.status() === 200);

  // Pagination → backend GET with page=2 (unfiltered set spans two pages).
  await page.getByTestId('wsi-page-next').click();
  await page.waitForResponse((r) => r.url().includes('/api/v1/wsi') && r.url().includes('page=2') && r.status() === 200);
  await expect(page.getByTestId('wsi-page-info')).toHaveText(/Page 2 of 2/);

  // Every list refresh was a backend request (no client-only search truth).
  expect(listReqs().length).toBeGreaterThanOrEqual(4);
});
