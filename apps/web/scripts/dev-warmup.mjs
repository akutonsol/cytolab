#!/usr/bin/env node
/**
 * Dev server + route warmup.
 *
 * In `next dev`, every route is compiled on demand the first time it is
 * requested. The first heavy route (the dashboard) pulls ~8,800 modules and
 * takes 10-15s to compile — which the user otherwise pays for on their first
 * click after logging in. Because auth is enforced client-side, an anonymous
 * GET still triggers the full server compile, so we can pre-compile the heavy
 * routes in the background right after the server boots. The shared module
 * graph compiled by the first route makes every later route sub-second, so a
 * short warmup list covers the whole app.
 *
 * This only ever hits localhost and is dev-only. Escape hatch: `npm run dev:plain`.
 */
import { spawn } from 'node:child_process';

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;
// Ordered by graph size: /dashboard compiles the bulk (shared shell + charts);
// the rest add their own list/table modules. Sequential so they don't thrash CPU.
const WARMUP_ROUTES = ['/dashboard', '/records', '/patients', '/result-sheets', '/billing'];

// Start the real dev server, inheriting stdio so its logs and Ctrl-C behave normally.
const child = spawn('next', ['dev', '-p', String(PORT)], { stdio: 'inherit', env: process.env });
const forward = (sig) => { if (!child.killed) child.kill(sig); };
process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 0));

async function ready() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/login`, { redirect: 'manual' });
      if (r.status && r.status < 500) return true;
    } catch { /* server not up yet */ }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return false;
}

async function warm() {
  if (!(await ready())) return;
  console.log(`\n[warmup] pre-compiling ${WARMUP_ROUTES.length} heavy routes so your first navigation is instant…`);
  for (const route of WARMUP_ROUTES) {
    const t0 = Date.now();
    try {
      await fetch(`${BASE}${route}`, { redirect: 'manual' });
      console.log(`[warmup] ${route} ready (${Date.now() - t0}ms)`);
    } catch (e) {
      console.log(`[warmup] ${route} skipped (${e?.message ?? 'error'})`);
    }
  }
  console.log('[warmup] done — routes are compiled and cached.\n');
}

warm().catch(() => {});
