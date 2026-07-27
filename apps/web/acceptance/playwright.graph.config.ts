import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
// P5-8 — asset-graph search & navigation gate. testMatch covers traversal, lineage, permission tiers,
// delivery boundary, null/lifecycle truth, tenant/manipulated-id isolation, and contextual UI navigation.
export default defineConfig({
  testDir: __dirname,
  testMatch: /wsi-graph\.spec\.ts$/,
  globalSetup: path.join(__dirname, 'wsi-graph-global-setup.ts'),
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, workers: 1, retries: 0, reporter: 'list',
  outputDir: path.join(__dirname, '.output-graph'),
  use: { baseURL: process.env.ACCEPT_BASE_URL ?? 'http://localhost:3001', headless: true, actionTimeout: 15_000, navigationTimeout: 20_000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'wsi-graph-acceptance', use: { ...devices['Desktop Chrome'] } }],
});
