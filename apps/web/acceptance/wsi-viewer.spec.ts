import { test, expect, type Request } from '@playwright/test';
import { readViewerFixtures, VIEWER_STATE } from './wsi-viewer-global-setup';

/**
 * P5-4 rendered acceptance — the authenticated WSI viewer.
 *
 * Proves the viewer resolves slide pixels ONLY through the authenticated delivery path: the DZI descriptor
 * and every tile are fetched from /api/v1/wsi/delivery/* with an `Authorization: Bearer` header, no raw
 * external pixel request occurs, a real (nonblank) region renders, and the annotation overlay/interaction
 * survives the transport rewrite. Driven as the scoped, non-super viewer principal (record:view +
 * record:change + wsi:view) — never a superuser.
 */
const DELIVERY = '/api/v1/wsi/delivery';
const isDelivery = (u: string) => u.includes(`${DELIVERY}/`);
const isDescriptor = (u: string) => u.includes(`${DELIVERY}/descriptor`);
const isTile = (u: string) => u.includes(`${DELIVERY}/tiles/`);

test.use({ storageState: VIEWER_STATE });

test('viewer renders a real region through authenticated delivery, with no raw-URL pixel load', async ({ page, baseURL }) => {
  const fx = readViewerFixtures();
  const origin = new URL(baseURL!).origin;

  const requests: Request[] = [];
  page.on('request', (r) => requests.push(r));

  await page.goto(`/wsi/${fx.slide}`);

  // Wait for the authenticated descriptor + at least one authenticated tile to be requested.
  await page.waitForResponse((r) => isDescriptor(r.url()), { timeout: 20_000 });
  await page.waitForResponse((r) => isTile(r.url()) && r.status() === 200, { timeout: 20_000 });

  // The OSD canvas paints a nonblank region (indigo #4F46E5 tile over the black host).
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const cs = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
          let nonblank = 0;
          for (const c of cs) {
            if (c.width < 8 || c.height < 8) continue;
            const ctx = c.getContext('2d');
            if (!ctx) continue;
            let data: Uint8ClampedArray;
            try { data = ctx.getImageData(0, 0, c.width, c.height).data; } catch { continue; }
            for (let i = 0; i < data.length; i += 4 * 997) {
              if (data[i + 3] > 0 && data[i] + data[i + 1] + data[i + 2] > 60) nonblank++;
            }
          }
          return nonblank;
        }),
      { timeout: 15_000, message: 'OSD canvas never painted a nonblank region' },
    )
    .toBeGreaterThan(0);

  // ── Authorization contract on every delivery request ──
  const deliveryReqs = requests.filter((r) => isDelivery(r.url()));
  expect(deliveryReqs.some((r) => isDescriptor(r.url())), 'a descriptor request was made').toBe(true);
  expect(deliveryReqs.some((r) => isTile(r.url())), 'at least one tile request was made').toBe(true);

  for (const r of deliveryReqs) {
    const headers = await r.allHeaders();
    const auth = headers['authorization'] ?? '';
    expect(auth, `delivery request ${new URL(r.url()).pathname} carries a Bearer token`).toMatch(/^Bearer\s+\S+/);
    // Token lives in the header only — never in the URL/query string.
    expect(r.url()).not.toContain('token');
    expect(new URL(r.url()).search, 'no query string on a delivery URL').toBe('');
  }

  // ── No raw/external slide-pixel request. Slide bytes (descriptor/tiles) come ONLY from same-origin
  //    delivery; the only permitted cross-origin fetches are OSD's UI sprite chrome (jsdelivr), never pixels. ──
  for (const r of requests) {
    const u = r.url();
    if (isDelivery(u)) { expect(new URL(u).origin).toBe(origin); continue; }
    expect(u, 'no request references a .dzi slide URL').not.toContain('.dzi');
    if (r.resourceType() === 'image') {
      const external = new URL(u).origin !== origin;
      if (external) expect(new URL(u).hostname, 'only OSD UI sprites may be cross-origin').toBe('cdn.jsdelivr.net');
    }
  }

  // ── Annotation overlay + interaction preserved ──
  // The seeded annotation renders as an overlay marker.
  await expect(page.locator('svg circle').first()).toBeVisible();
  // The add-annotation affordance is available to a record:change principal, and entering add mode shows the hint.
  const addBtn = page.getByTitle('Add annotation');
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await expect(page.getByText('Click on the slide to place an annotation')).toBeVisible();
});
