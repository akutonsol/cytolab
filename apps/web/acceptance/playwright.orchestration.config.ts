import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
// P5-6 — multi-slide orchestration gate. testMatch covers Part A (tray/switch) + Part B (compare/sync).
export default defineConfig({
  testDir: __dirname,
  testMatch: /wsi-orchestration\.spec\.ts$/,
  globalSetup: path.join(__dirname, 'wsi-orchestration-global-setup.ts'),
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, workers: 1, retries: 0, reporter: 'list',
  outputDir: path.join(__dirname, '.output-orchestration'),
  use: { baseURL: process.env.ACCEPT_BASE_URL ?? 'http://localhost:3001', headless: true, actionTimeout: 15_000, navigationTimeout: 20_000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'wsi-orchestration-acceptance', use: { ...devices['Desktop Chrome'] } }],
});
