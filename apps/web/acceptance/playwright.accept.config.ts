import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// P5-6.4 rendered-acceptance harness. Runs against an ISOLATED web (:3001) + API (:4001) + acceptance DB,
// started by the Stage-3 CI workflow. Serial (workers:1) with deterministic ordering: the destructive
// publish gate runs last. Auth is real cookie login captured to storageState by global-setup; each spec
// block selects the reviewer or publisher state via test.use().
export default defineConfig({
  testDir: __dirname,
  testMatch: /wsi-review\.spec\.ts$/,
  globalSetup: path.join(__dirname, 'global-setup.ts'),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: path.join(__dirname, '.output'),
  use: {
    baseURL: process.env.ACCEPT_BASE_URL ?? 'http://localhost:3001',
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'acceptance', use: { ...devices['Desktop Chrome'] } }],
});
