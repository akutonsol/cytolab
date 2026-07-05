import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// E2E against the running dev servers (web :3000, api :4000). Auth uses HttpOnly
// cookies + localStorage claims, so storageState (which captures both) is reused
// across tests via global setup.
export default defineConfig({
  testDir: './e2e',
  globalSetup: path.join(__dirname, 'e2e', 'global-setup.ts'),
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // single worker: shared dev server + shared demo DB
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  outputDir: './e2e/.output',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    // Default identity for most suites; auth/access-control specs override this.
    storageState: path.join(__dirname, 'e2e', '.auth', 'superuser.json'),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
