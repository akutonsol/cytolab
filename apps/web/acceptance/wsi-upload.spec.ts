import { test, expect, type Request } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { readUploadFixtures, UPLOADER_STATE } from './wsi-upload-global-setup';

/**
 * P5-4 Phase B Part 1 — the WSI upload gate.
 *
 * Proves the new upload UI drives the REAL chunked-ingestion pipeline (initiate → chunk → complete), NOT the
 * legacy paste-URL creation path; that the post-upload state is surfaced truthfully (processing — awaiting
 * review & publication, NEVER "viewable"); and that the uploader (record:change + wsi:review, no
 * wsi:publish) gains NO publication authority (a forced publish is a genuine backend 403). Driven as the
 * scoped non-super uploader.
 *
 * Worker is OFF in this stack, so the slide legitimately stops at processing/queued — the gate asserts the
 * UI says exactly that and never claims viewability. The full worker → READY → publish → render path is a
 * separate, worker-enabled gate (see report).
 */
const RESULT_PATH = path.join(__dirname, '.upload-result.json');

test.use({ storageState: UPLOADER_STATE });

test('upload UI uses the ingestion pipeline, surfaces truthful pre-publication state, and confers no publish authority', async ({ page, baseURL }) => {
  const fx = readUploadFixtures();
  const requests: Request[] = [];
  page.on('request', (r) => { if (r.method() === 'POST') requests.push(r); });

  await page.goto('/wsi');
  await page.getByTestId('wsi-upload-open').click();
  await expect(page.getByTestId('wsi-upload-modal')).toBeVisible();

  // Choose the seeded record + a small slide file.
  await page.locator('select').selectOption(fx.recordId);
  await page.getByTestId('wsi-upload-file').setInputFiles({
    name: 'acceptance-slide.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('P5-4 phase B part 1 acceptance upload fixture bytes — deterministic content'),
  });
  await page.getByTestId('wsi-upload-start').click();

  // Truthful terminal state (worker off): processing — awaiting review & publication, and NOT viewable.
  const lifecycle = page.getByTestId('wsi-upload-lifecycle');
  await expect(lifecycle).toBeVisible();
  await expect(lifecycle).toHaveAttribute('data-lifecycle-key', 'processing', { timeout: 30_000 });
  await expect(lifecycle).toHaveAttribute('data-viewable', 'false');
  await expect(page.getByText('Processing — awaiting review & publication')).toBeVisible();
  await expect(page.getByText(/wsi:publish/)).toBeVisible(); // truthful: publication needs authorized review
  // No false "viewable/ready to view" claim anywhere in the modal.
  await expect(page.getByTestId('wsi-upload-modal')).not.toContainText(/ready to view|now viewable|view now/i);

  // The created slide id (from the Open-slide link) for the DB-truth assertion step.
  const href = await page.getByTestId('wsi-upload-open-slide').getAttribute('href');
  const slideId = (href ?? '').split('/wsi/')[1] ?? '';
  expect(slideId).toMatch(/.+/);

  // ── A: the UI used the ingestion endpoints, NOT the legacy paste-URL create ──
  const posts = requests.map((r) => new URL(r.url()).pathname);
  expect(posts.some((p) => p === `/api/v1/wsi/records/${fx.recordId}/slide-uploads`), 'initiate called').toBe(true);
  expect(posts.some((p) => /\/api\/v1\/wsi\/slide-ingestions\/[^/]+\/chunks$/.test(p)), 'chunk(s) called').toBe(true);
  expect(posts.some((p) => /\/api\/v1\/wsi\/slide-ingestions\/[^/]+\/complete$/.test(p)), 'complete called').toBe(true);
  expect(posts.some((p) => /\/api\/v1\/wsi\/record\/[^/]+$/.test(p)), 'legacy paste create must NOT be used').toBe(false);

  // ── C: uploader has NO publish authority — a forced publish is a genuine backend 403 ──
  const forced = await page.request.post(`${baseURL}/api/v1/wsi/slides/${slideId}/generations/none/publish`);
  expect(forced.status(), 'forced publish denied for a non-wsi:publish principal').toBe(403);

  // Hand off the created slide id for the DB-truth assertion (VERIFIED / DRAFT / QUEUED).
  fs.writeFileSync(RESULT_PATH, JSON.stringify({ slideId }, null, 2));
});
