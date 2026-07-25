#!/usr/bin/env node
/**
 * P5-6.4 rendered-acceptance — zero-orange pixel detector for the clinical review surfaces.
 *
 * Screenshots each rendered review surface and counts pixels matching the repository's EXACT approved
 * threshold. Fails non-zero if ANY captured surface has a positive count.
 *
 *   r > 200 && g >= 100 && g <= 190 && b < 90
 *
 * Usage: node orange-detector.mjs [--url http://localhost:3001]
 * Reads scoped creds + fixture slide/gen ids from ./.fixtures.json.
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg('url', 'http://localhost:3001');
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '.fixtures.json'), 'utf8'));

/** The one and only orange test — repository-exact. */
function countOrange(buf) {
  const png = PNG.sync.read(buf);
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    if (r > 200 && g >= 100 && g <= 190 && b < 90) n++;
  }
  return n;
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
}

async function openReview(page, slideId) {
  await page.goto(`${BASE}/wsi/${slideId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Clinical Review' }).click();
  await page.getByRole('dialog', { name: /clinical review/i }).waitFor();
  await page.waitForTimeout(400); // let the drawer settle
}

const results = [];
async function shoot(page, label) {
  const buf = await page.screenshot({ fullPage: false });
  const n = countOrange(buf);
  results.push({ label, orange: n });
  console.log(`  ${label}: orange px = ${n}`);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page, fx.creds.publisher.email, fx.creds.publisher.password);

  // 1) review drawer with READY + PUBLISHED(LIVE) + QC_FAILED status badges
  await openReview(page, fx.slides.publishFlow);
  await shoot(page, 'review-drawer(READY/QC_FAILED/PUBLISHED-LIVE)');

  // 2) QC_FAILED evidence drawer
  await page.getByRole('dialog', { name: /clinical review/i }).locator('li', { hasText: fx.gens.s1QcFailed }).getByRole('button', { name: 'Evidence' }).click();
  await page.getByRole('dialog', { name: /generation evidence/i }).waitFor();
  await page.waitForTimeout(300);
  await shoot(page, 'qc-failed-evidence');
  await page.keyboard.press('Escape');

  // 3) publish confirm modal
  await page.getByRole('dialog', { name: /clinical review/i }).locator('li', { hasText: fx.gens.s1Ready }).getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog', { name: /publish this generation/i }).waitFor();
  await page.waitForTimeout(200);
  await shoot(page, 'publish-confirm-modal');
  await page.getByRole('dialog', { name: /publish this generation/i }).getByRole('button', { name: 'Cancel' }).click();

  // 4) DIVERGENT banner (danger surface — the highest zero-orange risk)
  await openReview(page, fx.slides.divergent);
  await shoot(page, 'divergent-banner');

  const total = results.reduce((s, r) => s + r.orange, 0);
  console.log(`TOTAL orange px across ${results.length} surfaces: ${total}`);
  if (total > 0) { console.error('FAIL: non-zero orange detected'); process.exit(1); }
  console.log('PASS: zero orange on all acceptance surfaces');
} finally {
  await browser.close();
}
