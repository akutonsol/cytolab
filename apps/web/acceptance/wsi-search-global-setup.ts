import fs from 'node:fs';
import path from 'node:path';
import { browserLogin } from './global-setup';

// P5-5 global setup: real cookie login for the Lab-A searcher principal (record:view ONLY).
export const AUTH_DIR = path.join(__dirname, '.auth');
export const SEARCHER_STATE = path.join(AUTH_DIR, 'searcher.json');
export const SEARCH_FIXTURES_PATH = path.join(__dirname, '.search-fixtures.json');

export function readSearchFixtures() {
  if (!fs.existsSync(SEARCH_FIXTURES_PATH)) throw new Error(`search fixtures not found at ${SEARCH_FIXTURES_PATH} — run seed-wsi-search-acceptance first`);
  return JSON.parse(fs.readFileSync(SEARCH_FIXTURES_PATH, 'utf8')) as {
    labAId: string; labBId: string; creds: { searcher: { email: string; password: string } };
    totalA: number;
    slides: { draft: string; processing: string; ready: string; qcFailed: string; published: string; unique: string };
    search: { uniquePatient: string; uniqueStainFilter: string };
    crossLab: { patient: string; stain: string };
  };
}

export default async function globalSetup() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { creds } = readSearchFixtures();
  await browserLogin(creds.searcher.email, creds.searcher.password, SEARCHER_STATE);
}
