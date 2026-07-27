import fs from 'node:fs';
import path from 'node:path';
import { browserLogin } from './global-setup';

// P5-6 global setup: login the orchestrator principal (record:view+change + wsi:view + wsi:review).
export const AUTH_DIR = path.join(__dirname, '.auth');
export const ORCH_STATE = path.join(AUTH_DIR, 'orchestrator.json');
export const ORCH_FIXTURES_PATH = path.join(__dirname, '.orchestration-fixtures.json');

export function readOrchFixtures() {
  if (!fs.existsSync(ORCH_FIXTURES_PATH)) throw new Error(`orchestration fixtures not found — run seed-wsi-orchestration-acceptance first`);
  return JSON.parse(fs.readFileSync(ORCH_FIXTURES_PATH, 'utf8')) as {
    labAId: string; labBId: string; creds: { viewer: { email: string; password: string } };
    recordAId: string; recordBId: string;
    slides: { published: string; published2: string; ready: string; draft: string; labB: string };
    order: string[]; annotations: { published: string; published2: string; ready: string }; storeRoot: string;
  };
}

export default async function globalSetup() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { creds } = readOrchFixtures();
  await browserLogin(creds.viewer.email, creds.viewer.password, ORCH_STATE);
}
