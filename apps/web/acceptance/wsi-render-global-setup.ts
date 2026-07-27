import fs from 'node:fs';
import path from 'node:path';
import { request } from '@playwright/test';

// P5-4 Phase B Part 1B global setup: cookie sessions for the render gate's two scoped principals.
// pathologist P (record:change + wsi:review + wsi:publish + wsi:view) and uploader U (record:change +
// wsi:review, NO publish/view).
//
// P5-9 hardening (acceptance-only): each principal is minted via a SINGLE deterministic API login (not the
// retrying browser login that produced an authoritative false RED), and its storageState is built from the
// HttpOnly auth cookies PLUS the cytolab-auth localStorage claims hydrated from GET /auth/me (the app gates
// UI rendering on those claims). Product authentication and the login throttle are unchanged.
async function apiLoginState(baseURL: string, creds: { email: string; password: string }, statePath: string): Promise<void> {
  const ctx = await request.newContext({ baseURL });
  const r = await ctx.post('/api/v1/auth/login', { data: creds });
  if (![200, 201].includes(r.status())) throw new Error(`login failed for ${creds.email}: ${r.status()}`);
  const me = await (await ctx.get('/api/v1/auth/me')).json();
  const claims = {
    userId: me.id, email: me.email, labId: me.labId,
    roles: me.roles ?? [], permissions: me.permissions ?? [],
    isSuperRole: me.isSuperRole === true, ver: typeof me.ver === 'number' ? me.ver : 3,
  };
  const base = await ctx.storageState();
  const state = { cookies: base.cookies, origins: [{ origin: baseURL, localStorage: [{ name: 'cytolab-auth', value: JSON.stringify({ state: { claims }, version: 0 }) }] }] };
  fs.writeFileSync(statePath, JSON.stringify(state));
  await ctx.dispose();
}

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
  const baseURL = process.env.ACCEPT_BASE_URL ?? 'http://localhost:3001';
  await apiLoginState(baseURL, creds.pathologist, PATHOLOGIST_STATE);
  await apiLoginState(baseURL, creds.uploader, RENDER_UPLOADER_STATE);
}
