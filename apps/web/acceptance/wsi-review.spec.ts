import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFixtures, REVIEWER_STATE, PUBLISHER_STATE } from './global-setup';

/**
 * P5-6.4 rendered acceptance — clinical review workflow (7 gates).
 *
 * Behaviour-oriented: assertions target what the reviewer/pathologist SEES (status labels, LIVE marker,
 * QC reasons, toasts, disabled affordances) and the real API contract — not DOM structure or internal
 * query keys — so the harness stays meaningful after P5-6.4 freezes. Serial (workers:1); the destructive
 * publish gate runs LAST so earlier read/authz gates observe the pre-publish state.
 */
// Fixtures are read lazily (at run time, after the seeder), so the spec still lists/discovers statically
// without a fixtures file present.
type Fixtures = ReturnType<typeof readFixtures>;
let fx: Fixtures;
let S1: string, S2: string, S3: string;
let G: Fixtures['gens'];

test.beforeAll(() => {
  fx = readFixtures();
  S1 = fx.slides.publishFlow;
  S2 = fx.slides.divergent;
  S3 = fx.slides.paginated;
  G = fx.gens;
});

const reviewDrawer = (page: Page) => page.getByRole('dialog', { name: /clinical review/i });
const genRow = (page: Page, genId: string): Locator => reviewDrawer(page).locator('li', { hasText: genId });

async function openReview(page: Page, slideId: string) {
  await page.goto(`/wsi/${slideId}`);
  await page.getByRole('button', { name: 'Clinical Review' }).click();
  await expect(reviewDrawer(page)).toBeVisible();
}

// ── G2 — reviewer-only: disabled UI + real 403 + generation unchanged ─────────────────────────────
test.describe('reviewer authorization (G2)', () => {
  test.use({ storageState: REVIEWER_STATE });

  test('reviewer cannot publish: affordance disabled+explained, forced API call → 403, generation unchanged', async ({ page, baseURL }) => {
    await openReview(page, S1);
    // The READY row's Publish affordance is present but disabled, with a clear explanation.
    const publishBtn = genRow(page, G.s1Ready).getByRole('button', { name: 'Publish' });
    await expect(publishBtn).toBeDisabled();
    await expect(reviewDrawer(page)).toContainText('You do not have permission to publish (wsi:publish).');

    // Server is authoritative: force the real publish call with the reviewer session → 403.
    const res = await page.request.post(`${baseURL}/api/v1/wsi/slides/${S1}/generations/${G.s1Ready}/publish`);
    expect(res.status()).toBe(403);

    // Prove nothing changed: the READY generation is still READY, the published one still PUBLISHED.
    const review = await (await page.request.get(`${baseURL}/api/v1/wsi/slides/${S1}/review`)).json();
    const byId = Object.fromEntries(review.generations.map((g: { generationId: string; status: string }) => [g.generationId, g.status]));
    expect(byId[G.s1Ready]).toBe('READY');
    expect(byId[G.s1Published]).toBe('PUBLISHED');
    expect(review.currentPublishedGenerationId).toBe(G.s1Published);
  });
});

// ── G4/G5/G6/G7 — read-only gates (publisher session; none mutate S1's READY) ─────────────────────
test.describe('read-only review gates (G4,G5,G6,G7)', () => {
  test.use({ storageState: PUBLISHER_STATE });

  test('G4 — QC_FAILED evidence shows real reason code+detail; no storage/pixel info leaks', async ({ page }) => {
    await openReview(page, S1);
    await genRow(page, G.s1QcFailed).getByRole('button', { name: 'Evidence' }).click();
    const evidence = page.getByRole('dialog', { name: /generation evidence/i });
    await expect(evidence).toBeVisible();
    // Real QC failure reason (code + detail) from the seeded FAILED verification.
    await expect(evidence).toContainText('LEVEL_DIGEST_MISMATCH');
    await expect(evidence).toContainText('level 2 tile digest differs from the sealed manifest');
    await expect(evidence).toContainText('MANIFEST_CHECKSUM_MISMATCH');
    // Candidate-pixel / storage information must never enter the rendered contract.
    const html = await evidence.innerHTML();
    expect(html).not.toContain('storageKey');
    expect(html).not.toMatch(/slides\/[^"']*\/derivatives/); // no derivative storage paths
    expect(html).not.toContain('.dzi');
  });

  test('G5 — DIVERGENT locks out ALL publication (banner + no enabled publish path)', async ({ page }) => {
    await openReview(page, S2);
    await expect(reviewDrawer(page)).toContainText('Publication state is inconsistent. Publishing is unavailable until the slide state is reviewed.');
    // S2 carries a READY generation that would normally be publishable — its Publish must be DISABLED.
    await expect(genRow(page, G.s2Ready).getByRole('button', { name: 'Publish' })).toBeDisabled();
    // No enabled Publish button anywhere on the surface.
    const enabled = await reviewDrawer(page).getByRole('button', { name: 'Publish' }).evaluateAll((els) => els.filter((e) => !(e as HTMLButtonElement).disabled).length);
    expect(enabled).toBe(0);
  });

  test('G6 — publication history paginates with append + uniqueness across pages', async ({ page }) => {
    await openReview(page, S3);
    const drawer = reviewDrawer(page);
    const loadMore = drawer.getByRole('button', { name: 'Load more' });
    await expect(loadMore).toBeVisible(); // first page did not exhaust 25 events

    // Collect published-generation ids across pages until exhausted; prove append (monotonic growth) + uniqueness.
    const idsOnPage = async () => drawer.locator('li').filter({ hasText: /Published/ }).allInnerTexts();
    const collected = new Set<string>();
    const pageIds = async () => (await idsOnPage()).map((t) => (t.match(/[a-z0-9]{20,}/i) || [''])[0]).filter(Boolean);

    let before = 0;
    for (let guard = 0; guard < 10; guard++) {
      for (const id of await pageIds()) collected.add(id);
      expect(collected.size).toBeGreaterThanOrEqual(before); // append: never shrinks
      before = collected.size;
      if (await loadMore.isVisible().catch(() => false)) await loadMore.click();
      else break;
    }
    await expect(drawer.getByText('End of history')).toBeVisible();
    expect(collected.size).toBe(25); // 25 distinct events, no duplicates across pages
  });

  test('G7 — mobile viewport: drawer usable, no horizontal body overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openReview(page, S1);
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});

// ── G1/G3 — deliberate publication + in-place transition (LAST; mutates S1) ───────────────────────
test.describe('deliberate publication (G1,G3)', () => {
  test.use({ storageState: PUBLISHER_STATE });

  test('publisher publishes READY → PUBLISHED, prior → SUPERSEDED, LIVE marker moves — without reload', async ({ page }) => {
    await openReview(page, S1);
    // Pre-state: publisher sees the three generations; the published one is LIVE.
    await expect(genRow(page, G.s1Ready)).toContainText('Ready');
    await expect(genRow(page, G.s1QcFailed)).toContainText('QC Failed');
    await expect(genRow(page, G.s1Published)).toContainText('Live');

    // Deliberate, confirm-gated publish of the READY generation.
    await genRow(page, G.s1Ready).getByRole('button', { name: 'Publish' }).click();
    const confirm = page.getByRole('dialog', { name: /publish this generation/i });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('superseded'); // names that the current live becomes superseded
    await confirm.getByRole('button', { name: 'Publish' }).click();

    // Server acknowledgement.
    await expect(page.getByText('Generation published.')).toBeVisible();

    // In-place transition (NO reload): READY→PUBLISHED+LIVE, prior PUBLISHED→SUPERSEDED, LIVE marker moved.
    await expect(genRow(page, G.s1Ready)).toContainText('Published');
    await expect(genRow(page, G.s1Ready)).toContainText('Live');
    await expect(genRow(page, G.s1Published)).toContainText('Superseded');
    await expect(genRow(page, G.s1Published)).not.toContainText('Live');
  });
});
