import { test, expect, type Request } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { readRenderFixtures, PATHOLOGIST_STATE, RENDER_UPLOADER_STATE } from './wsi-render-global-setup';

/**
 * P5-4 Phase B Part 1B — WORKER-ENABLED full-render acceptance.
 *
 * Proves the REAL replacement path end to end, against persisted backend truth (not UI-only):
 *   upload (UI, ingestion API) → VERIFIED → real worker → sealed+verified READY → NOT viewable →
 *   authorized wsi:publish → publishedGenerationId persisted → authenticated viewer renders the WSI.
 * And the clinical boundary: a non-wsi:publish uploader forcing publish gets a genuine 403.
 */
const RESULT_PATH = path.join(__dirname, '.render-result.json');
const DELIVERY = '/api/v1/wsi/delivery';

/** Dependency-free solid-colour PNG (indigo) — a real image libvips dzsave can tile into a full DZI. */
function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const tab: number[] = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tab[n] = c >>> 0; }
  const crc = (b: Buffer) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = tab[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, 'ascii'); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { const o = y * (1 + w * 3); raw[o] = 0; for (let x = 0; x < w; x++) { const p = o + 1 + x * 3; raw[p] = rgb[0]; raw[p + 1] = rgb[1]; raw[p + 2] = rgb[2]; } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test.describe('full render path (pathologist: record:change + wsi:review + wsi:publish + wsi:view)', () => {
  test.use({ storageState: PATHOLOGIST_STATE });

  test('upload → real worker READY (not viewable) → authorized publish → authenticated render', async ({ page, baseURL }) => {
    const fx = readRenderFixtures();
    const api = `${baseURL}/api/v1`;

    // 1) Upload a real image through the ingestion UI.
    await page.goto('/wsi');
    await page.getByTestId('wsi-upload-open').click();
    await expect(page.getByTestId('wsi-upload-modal')).toBeVisible();
    await page.locator('select').selectOption(fx.recordId);
    await page.getByTestId('wsi-upload-file').setInputFiles({ name: 'render-slide.png', mimeType: 'image/png', buffer: solidPng(512, 512, [79, 70, 229]) });
    await page.getByTestId('wsi-upload-start').click();

    // Wait until upload verified (lifecycle leaves uploading/verifying).
    const lifecycle = page.getByTestId('wsi-upload-lifecycle');
    await expect(lifecycle).toBeVisible({ timeout: 30_000 });
    const href = await page.getByTestId('wsi-upload-open-slide').getAttribute('href');
    const slideId = (href ?? '').split('/wsi/')[1] ?? '';
    expect(slideId).toMatch(/.+/);

    // 2) NOT viewable pre-publish: delivery-session issuance is 409 while there is no published generation
    //    (true for VERIFIED / QUEUED / PROCESSING / READY — the resolver gates solely on a published gen).
    const issue = () => page.request.post(`${api}/wsi/slides/${slideId}/delivery-session`);
    expect((await issue()).status(), 'unpublished slide is not viewable (409)').toBe(409);

    // 3) The REAL worker reaches a sealed+verified READY generation. Poll the review surface (persisted truth).
    const reviewUrl = `${api}/wsi/slides/${slideId}/review`;
    let readyGenId = '';
    await expect
      .poll(async () => {
        const r = await page.request.get(reviewUrl);
        if (!r.ok()) return 'no-review';
        const j = await r.json();
        const ready = (j.generations ?? []).find((g: any) => g.status === 'READY');
        if (ready) readyGenId = ready.generationId;
        return ready ? 'READY' : (j.generations ?? []).map((g: any) => g.status).join(',') || 'none';
      }, { timeout: 150_000, intervals: [2000, 2000, 3000] })
      .toBe('READY');
    expect(readyGenId).toMatch(/.+/);

    // 4) READY is still NOT viewable (no publication yet): issuance 409 + no published pointer.
    expect((await issue()).status(), 'READY-but-unpublished is not viewable (409)').toBe(409);
    const preReview = await (await page.request.get(reviewUrl)).json();
    expect(preReview.currentPublishedGenerationId, 'no published generation before publish').toBeFalsy();

    // 5) Authorized wsi:publish action publishes the READY generation (genuine backend action).
    const pub = await page.request.post(`${api}/wsi/slides/${slideId}/generations/${readyGenId}/publish`);
    expect(pub.status(), 'authorized publish succeeds (200)').toBe(200);

    // 6) Persisted publish truth: the slide now points at the published generation.
    const postReview = await (await page.request.get(reviewUrl)).json();
    expect(postReview.currentPublishedGenerationId, 'publishedGenerationId persisted').toBe(readyGenId);
    expect((await issue()).status(), 'published slide is now viewable (201)').toBe(201);

    // 7) Authenticated viewer actually RENDERS the uploaded WSI through the Phase A delivery boundary.
    const requests: Request[] = [];
    page.on('request', (r) => requests.push(r));
    await page.goto(`/wsi/${slideId}`);
    await page.waitForResponse((r) => r.url().includes(`${DELIVERY}/descriptor`), { timeout: 30_000 });
    await page.waitForResponse((r) => r.url().includes(`${DELIVERY}/tiles/`) && r.status() === 200, { timeout: 30_000 });
    await expect
      .poll(async () => page.evaluate(() => {
        const cs = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
        let nb = 0;
        for (const c of cs) { if (c.width < 8 || c.height < 8) continue; const g = c.getContext('2d'); if (!g) continue; let d: Uint8ClampedArray; try { d = g.getImageData(0, 0, c.width, c.height).data; } catch { continue; } for (let i = 0; i < d.length; i += 4 * 997) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 60) nb++; }
        return nb;
      }), { timeout: 20_000, message: 'uploaded WSI did not render a nonblank region' })
      .toBeGreaterThan(0);
    for (const r of requests.filter((r) => r.url().includes(`${DELIVERY}/`))) {
      expect((await r.allHeaders())['authorization'] ?? '', 'delivery request carries Bearer').toMatch(/^Bearer\s+\S+/);
    }

    fs.writeFileSync(RESULT_PATH, JSON.stringify({ slideId, generationId: readyGenId }, null, 2));
  });
});

test.describe('publish boundary (uploader: record:change + wsi:review, NO wsi:publish)', () => {
  test.use({ storageState: RENDER_UPLOADER_STATE });

  test('a non-wsi:publish uploader forcing publish gets a genuine 403 (upload confers no publish authority)', async ({ page, baseURL }) => {
    const { slideId, generationId } = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf8'));
    const res = await page.request.post(`${baseURL}/api/v1/wsi/slides/${slideId}/generations/${generationId}/publish`);
    expect(res.status(), 'forced publish denied for a principal lacking wsi:publish').toBe(403);
  });
});
