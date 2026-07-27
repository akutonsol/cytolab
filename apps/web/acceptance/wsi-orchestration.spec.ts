import { test, expect, type Request } from '@playwright/test';
import { readOrchFixtures, ORCH_STATE } from './wsi-orchestration-global-setup';

/**
 * P5-6 — multi-slide orchestration acceptance.
 * Part A: case-aware tray + switching. (Part B: side-by-side + synchronized viewports — added after Part A.)
 * Driven as the scoped orchestrator (record:view + record:change + wsi:view + wsi:review).
 */
const DELIVERY = '/api/v1/wsi/delivery';

// Count non-blank <canvas> pixels under a DOM root — the state-based proof that OSD actually painted tiles.
function sampleNonblank(root: ParentNode): number {
  const cs = Array.from(root.querySelectorAll('canvas')) as HTMLCanvasElement[];
  let nb = 0;
  for (const c of cs) {
    if (c.width < 8 || c.height < 8) continue;
    const g = c.getContext('2d'); if (!g) continue;
    let d: Uint8ClampedArray; try { d = g.getImageData(0, 0, c.width, c.height).data; } catch { continue; }
    for (let i = 0; i < d.length; i += 4 * 997) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 60) nb++;
  }
  return nb;
}
function canvasNonblank(page: import('@playwright/test').Page): Promise<number> {
  return page.locator('body').evaluate(sampleNonblank).catch(() => 0);
}
function panelNonblank(page: import('@playwright/test').Page, side: 'left' | 'right'): Promise<number> {
  return page.locator(`[data-testid="wsi-compare-panel"][data-side="${side}"]`).evaluate(sampleNonblank).catch(() => 0);
}

test.use({ storageState: ORCH_STATE });

test.describe('P5-6 Part A — case-aware tray + switching', () => {
  test('record-scoped set, tray order, per-slide viewability, navigation bounds, slide-specific annotations', async ({ page, baseURL }) => {
    const fx = readOrchFixtures();
    const api = `${baseURL}/api/v1`;

    // ── API: record-scoped orchestration set (deterministic order) ──
    const setR = await (await page.request.get(`${api}/wsi`, { params: { recordId: fx.recordAId, sort: 'oldest', pageSize: 200 } })).json();
    expect(setR.total).toBe(4);
    expect(setR.data.map((s: any) => s.id)).toEqual(fx.order); // published < ready < draft < published2 by uploadedAt

    // ── Tenant isolation: Lab-A principal cannot obtain Lab-B's record set ──
    expect((await (await page.request.get(`${api}/wsi`, { params: { recordId: fx.recordBId } })).json()).total).toBe(0);

    // ── Per-slide viewability: published→201, READY(unpublished)→409, DRAFT→409 (published A ≠ authority for B) ──
    expect((await page.request.post(`${api}/wsi/slides/${fx.slides.published}/delivery-session`)).status()).toBe(201);
    expect((await page.request.post(`${api}/wsi/slides/${fx.slides.ready}/delivery-session`)).status()).toBe(409);
    expect((await page.request.post(`${api}/wsi/slides/${fx.slides.draft}/delivery-session`)).status()).toBe(409);

    // ── UI: open the published slide → tray shows the record's 3 slides, in order ──
    const reqs: Request[] = [];
    page.on('request', (r) => reqs.push(r));
    await page.goto(`/wsi/${fx.slides.published}`);
    await expect(page.getByTestId('wsi-tray')).toBeVisible();
    await expect(page.getByTestId('wsi-tray-slide')).toHaveCount(4);
    const trayIds = await page.getByTestId('wsi-tray-slide').evaluateAll((els) => els.map((e) => e.getAttribute('data-slide-id')));
    expect(trayIds).toEqual(fx.order);
    await expect(page.getByTestId('wsi-tray-count')).toHaveText('1 / 4');
    await expect(page.locator(`[data-testid="wsi-tray-slide"][data-slide-id="${fx.slides.published}"]`)).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('wsi-tray-prev')).toBeDisabled(); // at first — cannot go before the record

    // published renders through its own authenticated delivery session (state-based — no event-timing race).
    await expect.poll(() => canvasNonblank(page), { timeout: 30_000, message: 'published slide did not render' }).toBeGreaterThan(0);
    // the render used the authenticated delivery boundary: tiles were fetched, each carrying a Bearer token.
    expect(reqs.some((r) => r.url().includes(`${DELIVERY}/tiles/`)), 'tiles fetched via delivery').toBe(true);
    for (const r of reqs.filter((r) => r.url().includes(`${DELIVERY}/`))) expect((await r.allHeaders())['authorization'] ?? '').toMatch(/^Bearer\s+\S+/);
    // annotation belongs to the active (published) slide
    await expect(page.getByText(fx.annotations.published, { exact: true })).toBeVisible();
    await expect(page.getByText(fx.annotations.ready, { exact: true })).toHaveCount(0);

    // ── Next → READY: NOT viewable (truthful empty state); annotation switches to READY's ──
    await page.getByTestId('wsi-tray-next').click();
    await expect(page.getByTestId('wsi-tray-count')).toHaveText('2 / 4');
    await expect(page.getByText('No published slide image yet')).toBeVisible(); // READY never viewable
    await expect(page.getByText(fx.annotations.ready, { exact: true })).toBeVisible();
    await expect(page.getByText(fx.annotations.published, { exact: true })).toHaveCount(0); // annotations are slide-specific

    // ── Next → DRAFT: NOT viewable ──
    await page.getByTestId('wsi-tray-next').click();
    await expect(page.getByTestId('wsi-tray-count')).toHaveText('3 / 4');
    await expect(page.getByText('No published slide image yet')).toBeVisible();

    // ── Next → PUBLISHED-2: viewable, renders through its OWN session; next disabled (record boundary) ──
    await page.getByTestId('wsi-tray-next').click();
    await expect(page.getByTestId('wsi-tray-count')).toHaveText('4 / 4');
    await expect(page.getByTestId('wsi-tray-next')).toBeDisabled();
    await expect.poll(() => canvasNonblank(page), { timeout: 30_000, message: 'published-2 did not render' }).toBeGreaterThan(0);
    await expect(page.getByText(fx.annotations.published2, { exact: true })).toBeVisible();
    await expect(page.getByText(fx.annotations.published, { exact: true })).toHaveCount(0);

    // ── Prev all the way back to PUBLISHED: renders again; its annotation restored ──
    for (let i = 0; i < 3; i++) await page.getByTestId('wsi-tray-prev').click();
    await expect(page.getByTestId('wsi-tray-count')).toHaveText('1 / 4');
    await expect(page.getByText(fx.annotations.published, { exact: true })).toBeVisible();
    await expect.poll(() => canvasNonblank(page), { timeout: 20_000 }).toBeGreaterThan(0);
  });
});

test.describe('P5-6 Part B — side-by-side + synchronized navigation (navigation only, not co-registration)', () => {
  test('two independent authenticated viewers from the same record; per-slide viewability preserved; sync is navigation-only', async ({ page, baseURL }) => {
    const fx = readOrchFixtures();
    const reqs: Request[] = [];
    page.on('request', (r) => reqs.push(r));

    await page.goto(`/wsi/${fx.slides.published}`);
    await expect(page.getByTestId('wsi-tray')).toBeVisible();

    // ── Enter compare → two panels; left = published, set right = published2 ──
    await page.getByTestId('wsi-compare-enter').click();
    await expect(page.getByTestId('wsi-compare')).toBeVisible();
    await expect(page.getByTestId('wsi-compare-panel')).toHaveCount(2);
    const rightSelect = page.locator('[data-testid="wsi-compare-panel"][data-side="right"] [data-testid="wsi-compare-select"]');
    await rightSelect.selectOption(fx.slides.published2);
    await expect(page.locator('[data-testid="wsi-compare-panel"][data-side="right"]')).toHaveAttribute('data-slide-id', fx.slides.published2);

    // ── Same-record-only: the compare selector offers exactly this record's other slides — none from Lab B ──
    const rightOpts = await rightSelect.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(new Set(rightOpts)).toEqual(new Set(fx.order.filter((id) => id !== fx.slides.published)));
    expect(rightOpts).not.toContain(fx.slides.labB);

    // ── Both sides render through their OWN authenticated delivery session (two live tile streams) ──
    await expect.poll(() => panelNonblank(page, 'left'), { timeout: 30_000, message: 'left panel did not render' }).toBeGreaterThan(0);
    await expect.poll(() => panelNonblank(page, 'right'), { timeout: 30_000, message: 'right panel did not render' }).toBeGreaterThan(0);
    // per-slide auth: each slide issued its OWN delivery session (a published A is not authority for B)
    expect(reqs.some((r) => r.method() === 'POST' && r.url().includes(`/wsi/slides/${fx.slides.published}/delivery-session`))).toBe(true);
    expect(reqs.some((r) => r.method() === 'POST' && r.url().includes(`/wsi/slides/${fx.slides.published2}/delivery-session`))).toBe(true);
    for (const r of reqs.filter((r) => r.url().includes('/wsi/delivery/'))) expect((await r.allHeaders())['authorization'] ?? '').toMatch(/^Bearer\s+\S+/);

    // ── Truthfulness: sync is navigation-only; the UI does NOT claim spatial alignment / co-registration ──
    await expect(page.getByTestId('wsi-compare-sync')).toBeChecked();
    await expect(page.getByTestId('wsi-compare-sync-note')).toContainText(/not spatially aligned|co-registered/i);

    // ── Sync navigation: zooming the LEFT viewport drives the RIGHT viewport too ──
    const leftPanel = page.locator('[data-testid="wsi-compare-panel"][data-side="left"]');
    const rightZoom = page.locator('[data-testid="wsi-compare-panel"][data-side="right"] [data-testid="wsi-zoom"]');
    for (let i = 0; i < 3; i++) await leftPanel.getByTitle('Zoom in').click();
    await expect
      .poll(async () => parseFloat(((await rightZoom.textContent()) ?? '1x').replace('x', '')), { timeout: 10_000, message: 'sync did not drive the right viewport' })
      .toBeGreaterThan(1.2);

    // ── Per-slide viewability preserved in compare: a READY (unpublished) slide on the right → truthful empty state ──
    await rightSelect.selectOption(fx.slides.ready);
    await expect(page.locator('[data-testid="wsi-compare-panel"][data-side="right"]').getByText('No published slide image yet')).toBeVisible();

    // ── Exit compare → single viewer + tray return ──
    await page.getByTestId('wsi-compare-exit').click();
    await expect(page.getByTestId('wsi-compare')).toHaveCount(0);
    await expect(page.getByTestId('wsi-tray')).toBeVisible();
  });
});
