import fs from 'node:fs';
import path from 'node:path';
import { browserLogin } from './global-setup';

// P5-4 Phase B Part 1B global setup: real cookie logins for the render gate's two scoped principals.
// pathologist P (record:change + wsi:review + wsi:publish + wsi:view) and uploader U (record:change +
// wsi:review, NO publish/view). Reuses the proven login helper.

export const AUTH_DIR = path.join(__dirname, '.auth');
export const PATHOLOGIST_STATE = path.join(AUTH_DIR, 'render-pathologist.json');
export const RENDER_UPLOADER_STATE = path.join(AUTH_DIR, 'render-uploader.json');
export const RENDER_FIXTURES_PATH = path.join(__dirname, '.render-fixtures.json');

export function readRenderFixtures() {
  if (!fs.existsSync(RENDER_FIXTURES_PATH)) {
    throw new Error(`render fixtures not found at ${RENDER_FIXTURES_PATH} — run seed-wsi-render-acceptance first`);
  }
  return JSON.parse(fs.readFileSync(RENDER_FIXTURES_PATH, 'utf8')) as {
    labId: string;
    creds: { pathologist: { email: string; password: string }; uploader: { email: string; password: string } };
    recordId: string;
  };
}

export default async function globalSetup() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { creds } = readRenderFixtures();
  await browserLogin(creds.pathologist.email, creds.pathologist.password, PATHOLOGIST_STATE);
  await browserLogin(creds.uploader.email, creds.uploader.password, RENDER_UPLOADER_STATE);
}
