import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// P5-4 Phase B Part 1 — the WSI upload gate. Same isolated stack as the other WSI harnesses; its own
// uploader principal + record fixture. Separate config so the accepted review/viewer gates are untouched.
export default defineConfig({
  testDir: __dirname,
  testMatch: /wsi-upload\.spec\.ts$/,
  globalSetup: path.join(__dirname, 'wsi-upload-global-setup.ts'),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: path.join(__dirname, '.output-upload'),
  use: {
    baseURL: process.env.ACCEPT_BASE_URL ?? 'http://localhost:3001',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'wsi-upload-acceptance', use: { ...devices['Desktop Chrome'] } }],
});
