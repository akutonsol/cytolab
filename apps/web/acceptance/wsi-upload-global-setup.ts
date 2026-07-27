import fs from 'node:fs';
import path from 'node:path';
import { browserLogin } from './global-setup';

// P5-4 Phase B Part 1 global setup: real cookie login for the scoped uploader principal
// (record:change + wsi:review, NO wsi:publish). Reuses the proven login helper.

export const AUTH_DIR = path.join(__dirname, '.auth');
export const UPLOADER_STATE = path.join(AUTH_DIR, 'uploader.json');
export const UPLOAD_FIXTURES_PATH = path.join(__dirname, '.upload-fixtures.json');

export function readUploadFixtures() {
  if (!fs.existsSync(UPLOAD_FIXTURES_PATH)) {
    throw new Error(`upload fixtures not found at ${UPLOAD_FIXTURES_PATH} — run seed-wsi-upload-acceptance first`);
  }
  return JSON.parse(fs.readFileSync(UPLOAD_FIXTURES_PATH, 'utf8')) as {
    labId: string;
    creds: { uploader: { email: string; password: string } };
    recordId: string;
  };
}

export default async function globalSetup() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { creds } = readUploadFixtures();
  await browserLogin(creds.uploader.email, creds.uploader.password, UPLOADER_STATE);
}
