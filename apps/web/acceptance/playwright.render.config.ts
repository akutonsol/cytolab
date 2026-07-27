import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// P5-4 Phase B Part 1B — the WORKER-ENABLED full-render gate. Same isolated stack, but with the real WSI
// processing worker running (WSI_PROCESSING_WORKER=true, WSI_TILING_ENGINE=libvips). Longer timeout: the
// test waits for the real worker to reach READY before an authorized publish and the authenticated render.
export default defineConfig({
  testDir: __dirname,
  testMatch: /wsi-upload-render\.spec\.ts$/,
  globalSetup: path.join(__dirname, 'wsi-render-global-setup.ts'),
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: path.join(__dirname, '.output-render'),
  use: {
    baseURL: process.env.ACCEPT_BASE_URL ?? 'http://localhost:3001',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'wsi-render-acceptance', use: { ...devices['Desktop Chrome'] } }],
});
