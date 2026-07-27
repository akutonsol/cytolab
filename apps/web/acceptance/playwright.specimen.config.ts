import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
// P5-7 — case & specimen integration gate. testMatch covers API discovery/filter, both workspace surfaces,
// upload specimen anchoring, per-slide viewability, and tenant/cross-record isolation.
export default defineConfig({
  testDir: __dirname,
  testMatch: /wsi-specimen\.spec\.ts$/,
  globalSetup: path.join(__dirname, 'wsi-specimen-global-setup.ts'),
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, workers: 1, retries: 0, reporter: 'list',
  outputDir: path.join(__dirname, '.output-specimen'),
  use: { baseURL: process.env.ACCEPT_BASE_URL ?? 'http://localhost:3001', headless: true, actionTimeout: 15_000, navigationTimeout: 20_000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'wsi-specimen-acceptance', use: { ...devices['Desktop Chrome'] } }],
});
