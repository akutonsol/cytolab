import fs from 'node:fs';
import path from 'node:path';
import { browserLogin } from './global-setup';

// P5-8 global setup: login the VIEWER principal (record:view only) for the UI navigation tests. The
// permission-tier API tests log in the reviewer/deliverer principals in-spec via isolated contexts.
export const AUTH_DIR = path.join(__dirname, '.auth');
export const GRAPH_STATE = path.join(AUTH_DIR, 'graph-viewer.json');
export const GRAPH_FIXTURES_PATH = path.join(__dirname, '.graph-fixtures.json');

export function readGraphFixtures() {
  if (!fs.existsSync(GRAPH_FIXTURES_PATH)) throw new Error(`graph fixtures not found — run seed-wsi-graph-acceptance first`);
  return JSON.parse(fs.readFileSync(GRAPH_FIXTURES_PATH, 'utf8')) as {
    labAId: string; labBId: string;
    creds: { viewer: { email: string; password: string }; reviewer: { email: string; password: string }; deliverer: { email: string; password: string } };
    recordAId: string; patientAId: string; recordBId: string;
    specimens: { S1: string; SB: string };
    slides: { pub: string; ready: string; null: string; labB: string };
    lineage: { pubGenId: string; pubJobId: string; pubIngestionId: string; labBGenId: string };
    expect: { recordASlideCount: number };
    storeRoot: string;
  };
}

export default async function globalSetup() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { creds } = readGraphFixtures();
  await browserLogin(creds.viewer.email, creds.viewer.password, GRAPH_STATE);
}
