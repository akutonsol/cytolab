import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Real cookie login (+ localStorage claims the app gates rendering on) for the two seeded scoped
// principals, captured to storageState for the spec. Fixtures/creds come from the seeder's .fixtures.json.
export const ACCEPT_BASE = process.env.ACCEPT_BASE_URL ?? 'http://localhost:3001';
export const AUTH_DIR = path.join(__dirname, '.auth');
export const REVIEWER_STATE = path.join(AUTH_DIR, 'reviewer.json');
export const PUBLISHER_STATE = path.join(AUTH_DIR, 'publisher.json');
export const FIXTURES_PATH = path.join(__dirname, '.fixtures.json');

export function readFixtures() {
  if (!fs.existsSync(FIXTURES_PATH)) {
    throw new Error(`fixtures not found at ${FIXTURES_PATH} — run the acceptance seeder first`);
  }
  return JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8')) as {
    labId: string;
    creds: { reviewer: { email: string; password: string }; publisher: { email: string; password: string } };
    slides: { publishFlow: string; divergent: string; paginated: string };
    gens: { s1Published: string; s1Ready: string; s1QcFailed: string; s2Divergent: string; s2Ready: string };
  };
}

async function browserLogin(email: string, password: string, file: string) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL: ACCEPT_BASE });
    await page.goto('/login');
    await page.fill('#login-email', email);
    await page.fill('#login-password', password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard', { timeout: 20_000 });
    await page.context().storageState({ path: file });
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(_config: FullConfig) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { creds } = readFixtures();
  await browserLogin(creds.reviewer.email, creds.reviewer.password, REVIEWER_STATE);
  await browserLogin(creds.publisher.email, creds.publisher.password, PUBLISHER_STATE);
}
