import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// P5-5 — slide discovery (metadata & indexing / search) gate. Same isolated stack; searcher principal.
export default defineConfig({
  testDir: __dirname,
  testMatch: /wsi-search\.spec\.ts$/,
  globalSetup: path.join(__dirname, 'wsi-search-global-setup.ts'),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: path.join(__dirname, '.output-search'),
  use: { baseURL: process.env.ACCEPT_BASE_URL ?? 'http://localhost:3001', headless: true, actionTimeout: 15_000, navigationTimeout: 20_000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'wsi-search-acceptance', use: { ...devices['Desktop Chrome'] } }],
});
