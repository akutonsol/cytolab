import { test, expect, type BrowserContext, type Browser } from '@playwright/test';
import { readGraphFixtures, GRAPH_STATE } from './wsi-graph-global-setup';

/**
 * P5-8 — asset-graph search & navigation acceptance.
 * Proves: bounded slide-neighbourhood traversal (record:view), the ingestion→job→generation→asset lineage
 * (wsi:review), the three permission tiers held independently (record:view metadata ≠ wsi:review internals ≠
 * wsi:view delivery), the delivery boundary (traversal issues no pixels/tokens/storageKeys), truthful null/
 * unassigned + lifecycle, tenant + manipulated-id isolation, and contextual UI navigation grounded on
 * persisted relationships. The default context is the VIEWER (record:view only); reviewer/deliverer log in
 * to isolated contexts in-spec.
 */
test.use({ storageState: GRAPH_STATE });

const V1 = '/api/v1';

async function loginCtx(browser: Browser, baseURL: string, creds: { email: string; password: string }): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL });
  const r = await ctx.request.post(`${V1}/auth/login`, { data: creds });
  if (![200, 201].includes(r.status())) throw new Error(`login failed for ${creds.email}: ${r.status()}`);
  return ctx;
}

test.describe('P5-8 — asset-graph search & navigation', () => {
  test('Part A — bounded slide neighbourhood: persisted edges only, no internals/pixels, null + lifecycle truth', async ({ page, baseURL }) => {
    const fx = readGraphFixtures();
    // Published slide neighbourhood (record:view tier).
    const g = await (await page.request.get(`${baseURL}${V1}/wsi/slides/${fx.slides.pub}/graph`)).json();
    expect(g.node).toBe('slide');
    expect(g.record?.id).toBe(fx.recordAId);
    expect(g.patient?.id).toBe(fx.patientAId);
    expect(g.specimen?.id).toBe(fx.specimens.S1);
    expect(g.unassignedSpecimen).toBe(false);
    expect(g.siblingSlideCount).toBe(fx.expect.recordASlideCount);
    expect(g.generationSummary).toMatchObject({ hasPublished: true });
    expect(g.generationSummary.total).toBeGreaterThanOrEqual(1);
    expect(g.slide.lifecycle).toMatchObject({ state: 'PUBLISHED', viewable: true });
    expect(g.links.record).toBe(`/records/${fx.recordAId}`);
    expect(g.links.specimenSlides).toContain(fx.specimens.S1);

    // Delivery boundary: NO pixels/token/storageKey/slideUrl and NO generation internals leak through /graph.
    const rawG = JSON.stringify(g);
    for (const forbidden of ['storageKey', 'slideUrl', 'token', 'manifestChecksum', 'verifications', 'assets']) {
      expect(rawG).not.toContain(forbidden);
    }

    // Null specimen slide → explicit unassigned, never fabricated.
    const gn = await (await page.request.get(`${baseURL}${V1}/wsi/slides/${fx.slides.null}/graph`)).json();
    expect(gn.specimen).toBeNull();
    expect(gn.unassignedSpecimen).toBe(true);
    expect(gn.links.specimenSlides).toBeNull();

    // READY (unpublished) slide stays truthfully non-published; discoverable ≠ viewable.
    const gr = await (await page.request.get(`${baseURL}${V1}/wsi/slides/${fx.slides.ready}/graph`)).json();
    expect(gr.slide.lifecycle).toMatchObject({ state: 'READY', viewable: false });
    expect(gr.generationSummary.hasPublished).toBe(false);
  });

  test('Part B — lineage + permission tiers: record:view cannot read internals; wsi:review reveals ingestion→job→asset', async ({ page, baseURL, browser }) => {
    const fx = readGraphFixtures();
    const evUrl = `${V1}/wsi/slides/${fx.slides.pub}/generations/${fx.lineage.pubGenId}/evidence`;

    // record:view principal (default context) MUST NOT reach generation/asset internals.
    expect((await page.request.get(`${baseURL}${evUrl}`)).status()).toBe(403);

    // wsi:review principal gets the full lineage.
    const reviewer = await loginCtx(browser, baseURL!, fx.creds.reviewer);
    const evRes = await reviewer.request.get(`${baseURL}${evUrl}`);
    expect(evRes.status()).toBe(200);
    const ev = await evRes.json();
    // Completed lineage: ingestion → job → this generation → assets, grounded on seeded ids.
    expect(ev.source?.ingestion?.id).toBe(fx.lineage.pubIngestionId);
    expect(ev.source?.job?.id).toBe(fx.lineage.pubJobId);
    expect(ev.source.ingestion.sourceKind).toBe('UPLOAD');
    expect(ev.source.job.status).toBe('SUCCEEDED');
    expect(ev.assets.map((a: any) => a.role)).toEqual(expect.arrayContaining(['TILE_PYRAMID', 'MANIFEST']));
    // Even at the review tier, storage keys never leak.
    expect(JSON.stringify(ev)).not.toContain('storageKey');

    // Manipulated ids: a generation from another slide / another tenant is a 404, not a leak.
    expect((await reviewer.request.get(`${baseURL}${V1}/wsi/slides/${fx.slides.ready}/generations/${fx.lineage.pubGenId}/evidence`)).status()).toBe(404); // cross-slide
    expect((await reviewer.request.get(`${baseURL}${V1}/wsi/slides/${fx.slides.pub}/generations/${fx.lineage.labBGenId}/evidence`)).status()).toBe(404); // cross-tenant generation
    await reviewer.close();
  });

  test('Delivery tier + tenant isolation: traversal grants no pixels; wsi:view delivers only published; cross-lab is 404', async ({ page, baseURL, browser }) => {
    const fx = readGraphFixtures();

    // record:view alone cannot issue a delivery session (needs wsi:view) — discovery is not delivery authority.
    expect((await page.request.post(`${baseURL}${V1}/wsi/slides/${fx.slides.pub}/delivery-session`)).status()).toBe(403);
    // record:view cannot even traverse into another tenant's slide.
    expect((await page.request.get(`${baseURL}${V1}/wsi/slides/${fx.slides.labB}/graph`)).status()).toBe(404);

    // wsi:view principal: published delivers (201), READY stays non-viewable (409) even though discoverable.
    const deliverer = await loginCtx(browser, baseURL!, fx.creds.deliverer);
    expect((await deliverer.request.post(`${baseURL}${V1}/wsi/slides/${fx.slides.pub}/delivery-session`)).status()).toBe(201);
    expect((await deliverer.request.post(`${baseURL}${V1}/wsi/slides/${fx.slides.ready}/delivery-session`)).status()).toBe(409);
    // wsi:view cannot reach another tenant either.
    expect((await deliverer.request.post(`${baseURL}${V1}/wsi/slides/${fx.slides.labB}/delivery-session`)).status()).toBe(404);
    await deliverer.close();
  });

  test('Contextual UI navigation is grounded in persisted relationships', async ({ page }) => {
    const fx = readGraphFixtures();

    // Registry deep-links: slide row → record + patient (persisted ids).
    await page.goto('/wsi');
    await expect(page.locator(`[data-testid="wsi-row-record-link"][data-record-id="${fx.recordAId}"]`).first()).toBeVisible();
    await expect(page.locator(`[data-testid="wsi-row-patient-link"][data-patient-id="${fx.patientAId}"]`).first()).toBeVisible();

    // Viewer related-resources panel: record ↔ specimen ↔ generation summary, grounded on seeded ids.
    await page.goto(`/wsi/${fx.slides.pub}`);
    const related = page.getByTestId('wsi-related');
    await expect(related).toBeVisible();
    await expect(related).toHaveAttribute('data-record-id', fx.recordAId);
    await expect(related).toHaveAttribute('data-specimen-id', fx.specimens.S1);
    await expect(related).toHaveAttribute('data-unassigned', 'false');
    await expect(page.locator(`[data-testid="wsi-related-specimen"][data-specimen-id="${fx.specimens.S1}"]`)).toBeVisible();
    await expect(page.getByTestId('wsi-related-gens')).toHaveAttribute('data-has-published', 'true');

    // Null slide → explicit unassigned in the UI (never fabricated).
    await page.goto(`/wsi/${fx.slides.null}`);
    await expect(page.getByTestId('wsi-related')).toHaveAttribute('data-unassigned', 'true');
    await expect(page.getByTestId('wsi-related-unassigned')).toBeVisible();
  });
});
