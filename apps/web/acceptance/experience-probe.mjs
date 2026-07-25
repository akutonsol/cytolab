#!/usr/bin/env node
/**
 * P5-6.4 rendered-acceptance — review-specific interaction-timing probe.
 *
 * Measures the class-3 INTERACTION budget for the clinical review surface: click "Clinical Review" →
 * the drawer is visibly acknowledged/opening. Reports the measured duration AND enforces the ≤100 ms
 * acknowledgement budget (Experience Principle §8 / measure-experience.mjs class 3). Non-zero on breach.
 *
 * Usage: node experience-probe.mjs [--url http://localhost:3001] [--budget 100]
 * Reads scoped publisher creds + fixtures from ./.fixtures.json. Run against a PRODUCTION build.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg('url', 'http://localhost:3001');
const BUDGET = Number(arg('budget', 100));
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '.fixtures.json'), 'utf8'));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#login-email', fx.creds.publisher.email);
  await page.fill('#login-password', fx.creds.publisher.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });

  await page.goto(`${BASE}/wsi/${fx.slides.publishFlow}`, { waitUntil: 'networkidle' });
  const btn = page.getByRole('button', { name: 'Clinical Review' });
  await btn.waitFor();

  // click → first visible acknowledgement of the drawer (opening/visible)
  const t0 = Date.now();
  await btn.click();
  await page.getByRole('dialog', { name: /clinical review/i }).waitFor({ state: 'visible' });
  const ackMs = Date.now() - t0;

  console.log(`interaction: Clinical Review click → drawer acknowledged = ${ackMs} ms (budget ${BUDGET} ms)`);
  if (ackMs > BUDGET) { console.error(`FAIL: acknowledgement ${ackMs}ms exceeds ${BUDGET}ms budget`); process.exit(1); }
  console.log('PASS: interaction acknowledgement within budget');
} finally {
  await browser.close();
}
