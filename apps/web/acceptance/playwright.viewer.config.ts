import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// P5-4 rendered-acceptance harness — the authenticated WSI viewer gate. Runs against the same ISOLATED
// web (:3001) + API (:4001) + acceptance DB as the review harness, but with its own viewer principal and
// slide fixture. Separate config so the accepted P5-6.4 review gate is untouched.
export default defineConfig({
  testDir: __dirname,
  testMatch: /wsi-viewer\.spec\.ts$/,
  globalSetup: path.join(__dirname, 'wsi-viewer-global-setup.ts'),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: path.join(__dirname, '.output-viewer'),
  use: {
    baseURL: process.env.ACCEPT_BASE_URL ?? 'http://localhost:3001',
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'wsi-viewer-acceptance', use: { ...devices['Desktop Chrome'] } }],
});
