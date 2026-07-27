import fs from 'node:fs';
import path from 'node:path';
import { request } from '@playwright/test';

// P5-8 global setup: mint the VIEWER principal (record:view only) session via a SINGLE deterministic API
// login (not the retrying browser login) and persist its storageState for the UI navigation tests. The
// gate exercises three principals (viewer + in-spec reviewer + deliverer); keeping the viewer to one login
// POST holds the whole gate under the correct 5/60s anti-brute-force login throttle (never weakened).
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
  const baseURL = process.env.ACCEPT_BASE_URL ?? 'http://localhost:3001';
  const ctx = await request.newContext({ baseURL });
  // ONE clean login POST (no retry loop). Auth rides on HttpOnly cookies…
  const r = await ctx.post('/api/v1/auth/login', { data: creds.viewer });
  if (![200, 201].includes(r.status())) throw new Error(`viewer login failed: ${r.status()}`);
  // …but the app gates UI rendering on the non-secret claims it hydrates from /auth/me into localStorage.
  const me = await (await ctx.get('/api/v1/auth/me')).json();
  const claims = {
    userId: me.id, email: me.email, labId: me.labId,
    roles: me.roles ?? [], permissions: me.permissions ?? [],
    isSuperRole: me.isSuperRole === true, ver: typeof me.ver === 'number' ? me.ver : 3,
  };
  const base = await ctx.storageState(); // captures the HttpOnly auth cookies
  const state = {
    cookies: base.cookies,
    origins: [{ origin: baseURL, localStorage: [{ name: 'cytolab-auth', value: JSON.stringify({ state: { claims }, version: 0 }) }] }],
  };
  fs.writeFileSync(GRAPH_STATE, JSON.stringify(state));
  await ctx.dispose();
}
