import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

/**
 * Program 7 · Phase 7B.1 — the SOLE-LIFECYCLE-WRITER architectural boundary (L8). A source scan (no imports, no
 * bootstrap — runs anywhere) that proves NO production code writes `User.lifecycleState` or `User.isActive` through a
 * `User` mutation outside the single lifecycle command boundary (`IdentityLifecycleService`). Permitted exceptions are
 * ONLY: the lifecycle service itself, tests/specs, and the testing helpers. (Migrations + seed live under `prisma/`,
 * outside this scan.) This is the boundary the future acceptance gate binds — not merely DB-row no-drift.
 */
const SRC = resolve(__dirname, '../../');
const LIFECYCLE_SERVICE = resolve(__dirname, 'identity-lifecycle.service.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts') && !full.includes('/testing/')) out.push(full);
  }
  return out;
}

// Match a `<x>.user.update|updateMany|upsert( … )` call and capture a bounded window of its arguments.
const USER_WRITE = /\.user\.(update|updateMany|upsert)\s*\(([\s\S]{0,500})/g;
const LIFECYCLE_FIELD = /\b(isActive|lifecycleState)\b\s*:/;

describe('Identity Lifecycle Core — sole-writer boundary (L8)', () => {
  it('no production code writes User.isActive / User.lifecycleState outside IdentityLifecycleService', () => {
    const violations: string[] = [];
    for (const file of walk(SRC)) {
      if (resolve(file) === LIFECYCLE_SERVICE) continue; // the governed boundary is the only permitted writer
      const src = readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      USER_WRITE.lastIndex = 0;
      while ((m = USER_WRITE.exec(src)) !== null) {
        const argsWindow = m[2];
        // Only inspect up to the (heuristic) end of the call's data object; ignore trailing select/other calls.
        if (LIFECYCLE_FIELD.test(argsWindow)) {
          violations.push(`${relative(SRC, file)} → .user.${m[1]}(…) writes isActive/lifecycleState`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('IdentityLifecycleService IS the writer (positive control)', () => {
    const src = readFileSync(LIFECYCLE_SERVICE, 'utf8');
    expect(/\.user\.updateMany\s*\([\s\S]{0,500}(isActive|lifecycleState)\b\s*:/.test(src)).toBe(true);
  });
});
