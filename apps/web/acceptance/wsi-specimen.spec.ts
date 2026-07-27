import { test, expect } from '@playwright/test';
import { readSpecimenFixtures, SPEC_STATE } from './wsi-specimen-global-setup';

/**
 * P5-7 — case & specimen integration acceptance.
 * Proves: specimen-aware discovery (GET /wsi?specimenId=), record/specimen-anchored grouping in BOTH the
 * diagnostic-case and sign-out workspaces (grounded on seeded relationships), the truthful unassigned bucket,
 * per-slide viewability unchanged by grouping, specimen anchoring at upload + backend rejection of a
 * cross-record specimen, and tenant/cross-record isolation. Driven as the scoped principal
 * (record:view + record:change + wsi:view).
 */
test.use({ storageState: SPEC_STATE });

const api = (baseURL: string) => `${baseURL}/api/v1`;
const ids = (arr: any[]) => new Set(arr.map((s) => s.id));

// slide-ids rendered inside a workspace group locator
async function groupSlideIds(scope: import('@playwright/test').Locator): Promise<string[]> {
  return scope.locator('[data-slide-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-slide-id')!));
}

test.describe('P5-7 — case & specimen integration', () => {
  test('specimen-aware discovery + filter composition + tenant/cross-record isolation', async ({ page, baseURL }) => {
    const fx = readSpecimenFixtures();
    const A = api(baseURL!);

    // ── Record-scoped discovery exposes each slide's PERSISTED specimen identity (or null) ──
    const recA = await (await page.request.get(`${A}/wsi`, { params: { recordId: fx.recordAId, pageSize: 200 } })).json();
    expect(recA.total).toBe(fx.expect.recordASlideCount);
    const byId = new Map<string, any>(recA.data.map((s: any) => [s.id, s]));
    // S1 slides carry specimen S1; S2 slide carries S2; the null slide is truthfully record-level.
    for (const id of fx.expect.s1SlideIds) expect(byId.get(id)?.specimen?.id).toBe(fx.specimens.S1);
    for (const id of fx.expect.s2SlideIds) expect(byId.get(id)?.specimen?.id).toBe(fx.specimens.S2);
    for (const id of fx.expect.nullSlideIds) { expect(byId.get(id)?.specimenId).toBeNull(); expect(byId.get(id)?.specimen).toBeNull(); }

    // ── specimenId filter returns EXACTLY that specimen's slides (never fabricates the null slide in) ──
    const s1 = await (await page.request.get(`${A}/wsi`, { params: { specimenId: fx.specimens.S1, pageSize: 200 } })).json();
    expect(ids(s1.data)).toEqual(new Set(fx.expect.s1SlideIds));
    const s2 = await (await page.request.get(`${A}/wsi`, { params: { specimenId: fx.specimens.S2, pageSize: 200 } })).json();
    expect(ids(s2.data)).toEqual(new Set(fx.expect.s2SlideIds));
    expect(ids(s1.data).has(fx.slides.nullSlide)).toBe(false);
    expect(ids(s2.data).has(fx.slides.nullSlide)).toBe(false);

    // ── Filters compose with the accepted P5-5 lifecycle filter (additive, non-regressive) ──
    const s1Pub = await (await page.request.get(`${A}/wsi`, { params: { specimenId: fx.specimens.S1, status: 'PUBLISHED', pageSize: 200 } })).json();
    expect(ids(s1Pub.data)).toEqual(new Set([fx.slides.pubS1]));
    const s1Ready = await (await page.request.get(`${A}/wsi`, { params: { specimenId: fx.specimens.S1, status: 'READY', pageSize: 200 } })).json();
    expect(ids(s1Ready.data)).toEqual(new Set([fx.slides.readyS1]));

    // ── Cross-record: specimen S3 belongs to Record A2 — combining it with Record A yields nothing ──
    const crossRec = await (await page.request.get(`${A}/wsi`, { params: { recordId: fx.recordAId, specimenId: fx.specimens.S3, pageSize: 200 } })).json();
    expect(crossRec.total).toBe(0);
    const s3 = await (await page.request.get(`${A}/wsi`, { params: { specimenId: fx.specimens.S3, pageSize: 200 } })).json();
    expect(ids(s3.data)).toEqual(new Set([fx.slides.a2])); // resolves ONLY to its own record's slide

    // ── Cross-tenant: a Lab-A principal cannot reach Lab-B specimen/record slides via manipulated params ──
    expect((await (await page.request.get(`${A}/wsi`, { params: { specimenId: fx.specimens.SB, pageSize: 200 } })).json()).total).toBe(0);
    expect((await (await page.request.get(`${A}/wsi`, { params: { recordId: fx.recordBId, pageSize: 200 } })).json()).total).toBe(0);
  });

  test('diagnostic-case workspace groups slides by persisted specimen, with a truthful unassigned bucket', async ({ page }) => {
    const fx = readSpecimenFixtures();
    await page.goto(`/diagnostic-case/${fx.recordAId}`);
    await expect(page.getByTestId('dc-slide-groups')).toBeVisible();

    const s1Group = page.locator(`[data-testid="dc-slide-group"][data-specimen-id="${fx.specimens.S1}"]`);
    const s2Group = page.locator(`[data-testid="dc-slide-group"][data-specimen-id="${fx.specimens.S2}"]`);
    const unassigned = page.locator(`[data-testid="dc-slide-group"][data-unassigned="true"]`);
    await expect(s1Group).toBeVisible();
    await expect(s2Group).toBeVisible();
    await expect(unassigned).toBeVisible();

    expect(new Set(await groupSlideIds(s1Group))).toEqual(new Set(fx.expect.s1SlideIds));
    expect(new Set(await groupSlideIds(s2Group))).toEqual(new Set(fx.expect.s2SlideIds));
    expect(new Set(await groupSlideIds(unassigned))).toEqual(new Set(fx.expect.nullSlideIds));
    // Record isolation: no other record's slide (A2 / Lab B) leaks onto this record's workspace.
    await expect(page.locator(`[data-testid="dc-slide"][data-slide-id="${fx.slides.a2}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-testid="dc-slide"][data-slide-id="${fx.slides.labB}"]`)).toHaveCount(0);
  });

  test('sign-out workspace derives the same persisted specimen grouping', async ({ page }) => {
    const fx = readSpecimenFixtures();
    await page.goto(`/sign-out/${fx.recordAId}`);
    await expect(page.getByTestId('so-slide-groups')).toBeVisible();

    const s1Group = page.locator(`[data-testid="so-slide-group"][data-specimen-id="${fx.specimens.S1}"]`);
    const unassigned = page.locator(`[data-testid="so-slide-group"][data-unassigned="true"]`);
    await expect(s1Group).toBeVisible();
    await expect(unassigned).toBeVisible();
    expect(new Set(await groupSlideIds(s1Group))).toEqual(new Set(fx.expect.s1SlideIds));
    expect(new Set(await groupSlideIds(page.locator(`[data-testid="so-slide-group"][data-specimen-id="${fx.specimens.S2}"]`)))).toEqual(new Set(fx.expect.s2SlideIds));
    expect(new Set(await groupSlideIds(unassigned))).toEqual(new Set(fx.expect.nullSlideIds));
  });

  test('grouping never changes viewability — published under S1 delivers, READY under S1 does not', async ({ page, baseURL }) => {
    const fx = readSpecimenFixtures();
    const A = api(baseURL!);
    expect((await page.request.post(`${A}/wsi/slides/${fx.slides.pubS1}/delivery-session`)).status()).toBe(201);   // PUBLISHED → viewable
    expect((await page.request.post(`${A}/wsi/slides/${fx.slides.readyS1}/delivery-session`)).status()).toBe(409); // READY (same specimen) → not viewable
  });

  // LAST — mutates Record A (adds a slide). Keep after the exact-count assertions above.
  test('upload anchors to a same-record specimen; a cross-record specimen is rejected by the server', async ({ page, baseURL }) => {
    const fx = readSpecimenFixtures();
    const A = api(baseURL!);

    // Valid: anchor a new slide to S1 (belongs to Record A) → 201, persisted specimenId = S1.
    const ok = await page.request.post(`${A}/wsi/records/${fx.recordAId}/slide-uploads`, { data: { filename: 'p57.svs', sizeBytes: 2048, specimenId: fx.specimens.S1 } });
    expect(ok.status()).toBe(201);
    const newId = (await ok.json()).slideId as string;
    const detail = await (await page.request.get(`${A}/wsi/${newId}`)).json();
    expect(detail.specimen?.id).toBe(fx.specimens.S1);

    // Mismatch: S3 belongs to Record A2 — the server MUST reject anchoring it to Record A (genuine 400).
    const bad = await page.request.post(`${A}/wsi/records/${fx.recordAId}/slide-uploads`, { data: { filename: 'bad.svs', sizeBytes: 2048, specimenId: fx.specimens.S3 } });
    expect(bad.status()).toBe(400);
    // No fabricated association: S3's slide set is unchanged (still only its own record's slide).
    const s3After = await (await page.request.get(`${A}/wsi`, { params: { specimenId: fx.specimens.S3, pageSize: 200 } })).json();
    expect(ids(s3After.data)).toEqual(new Set([fx.slides.a2]));
  });
});
