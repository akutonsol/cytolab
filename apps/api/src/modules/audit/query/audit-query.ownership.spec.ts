import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * P2-7B — ownership + read-only architecture guards. Only the three approved owners may touch
 * prisma.auditEvent (append, verifier, and the new query reader); the query service is read-only.
 */
const AUDIT_DIR = path.join(__dirname, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

describe('P2-7B — audit-query ownership boundary', () => {
  const APPROVED = new Set([
    'audit-persistence.service.ts',
    'audit-verification.service.ts',
    path.join('query', 'audit-query.service.ts'),
  ]);

  // Actual accessor calls (any Prisma method on the model), not prose mentions.
  const ACCESSOR = /\.auditEvent\.(findMany|findFirst|findUnique|create|createMany|update|updateMany|delete|deleteMany|upsert|count|aggregate|groupBy)\b/;
  const MUTATION = /\.auditEvent\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\b/;

  it('only the three approved owners access prisma.auditEvent (no controller/DTO/other reader)', () => {
    const offenders: string[] = [];
    for (const file of walk(AUDIT_DIR)) {
      const rel = path.relative(AUDIT_DIR, file);
      if (APPROVED.has(rel)) continue;
      if (ACCESSOR.test(fs.readFileSync(file, 'utf8'))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('the query controller has no Prisma dependency and no ledger accessor', () => {
    const src = fs.readFileSync(path.join(AUDIT_DIR, 'query', 'audit-query.controller.ts'), 'utf8');
    expect(src).not.toMatch(/PrismaService/);
    expect(src).not.toMatch(ACCESSOR);
  });

  it('the query service calls no auditEvent mutation, imports no recorder, invokes no verifier', () => {
    const src = fs.readFileSync(path.join(AUDIT_DIR, 'query', 'audit-query.service.ts'), 'utf8');
    expect(src).not.toMatch(MUTATION);
    expect(src).not.toContain('$executeRaw');
    expect(src).not.toContain('$transaction');
    expect(src).not.toMatch(/from '[^']*audit-recorder'/);
    expect(src).not.toMatch(/from '[^']*audit-verification'/);
    expect(src).not.toMatch(/verifyChain\(/);
    // Only read accessors are present.
    expect(src).toMatch(/auditEvent\.findMany/);
    expect(src).toMatch(/auditEvent\.findFirst/);
  });
});
