import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * P2-7B — the three audit read permissions are added through the EXISTING catalog mechanism
 * (SPECIAL_OBJECTS.audit) and assigned to NO ordinary default role; system:security is untouched.
 * A source-level check keeps this a deterministic, DB-free guard.
 */
const SEED = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'prisma', 'seed.ts'), 'utf8');

describe('P2-7B — audit permission catalog', () => {
  it('SPECIAL_OBJECTS.audit generates audit:read / read_system / read_phi', () => {
    expect(SEED).toMatch(/audit:\s*\[\s*'read',\s*'read_system',\s*'read_phi'\s*\]/);
  });

  it('does not reuse or modify system:security', () => {
    // system:security stays within the `system` object and is never reused for audit. The `system` set also carries
    // 'ingestion' (P5C source-administration authority, added after this test was written) — reflected here so the
    // expectation matches the accepted platform state without changing what the test guards.
    expect(SEED).toMatch(/system:\s*\[\s*'health',\s*'security',\s*'ingestion'\s*\]/);
  });

  it('no default role byPrefix list selects the "audit" object', () => {
    // Every byPrefix([...]) prefix array in the role defs; none may include 'audit'.
    const prefixArrays = [...SEED.matchAll(/byPrefix\(\s*\[([^\]]*)\]/g)].map((m) => m[1]);
    expect(prefixArrays.length).toBeGreaterThan(0);
    for (const arr of prefixArrays) {
      expect(arr).not.toContain("'audit'");
    }
  });

  it('the catalog is de-duplicated by upsert on unique code (no duplicate audit codes)', () => {
    expect(SEED).toMatch(/permission\.upsert\(\{\s*where:\s*\{\s*code:/);
  });
});
