import fs from 'node:fs';
import path from 'node:path';
import { browserLogin } from './global-setup';

// P5-4 rendered-acceptance global setup: real cookie login for the single scoped, NON-super viewer
// principal (record:view + wsi:view), captured to storageState. Reuses the proven login helper from the
// review harness (keyboard activation + passive response capture) — no duplicated auth logic.

export const AUTH_DIR = path.join(__dirname, '.auth');
export const VIEWER_STATE = path.join(AUTH_DIR, 'viewer.json');
export const VIEWER_FIXTURES_PATH = path.join(__dirname, '.viewer-fixtures.json');

export function readViewerFixtures() {
  if (!fs.existsSync(VIEWER_FIXTURES_PATH)) {
    throw new Error(`viewer fixtures not found at ${VIEWER_FIXTURES_PATH} — run seed-wsi-viewer-acceptance first`);
  }
  return JSON.parse(fs.readFileSync(VIEWER_FIXTURES_PATH, 'utf8')) as {
    labId: string;
    creds: { viewer: { email: string; password: string } };
    slide: string;
    generationId: string;
    storeRoot: string;
  };
}

export default async function globalSetup() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { creds } = readViewerFixtures();
  await browserLogin(creds.viewer.email, creds.viewer.password, VIEWER_STATE);
}
