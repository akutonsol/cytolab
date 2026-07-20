import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * P2-7B — ownership + read-only architecture guards. Only the approved owners may touch
 * prisma.auditEvent (append, verifier, the query reader, and — P2-R016B-B1 — the chain allocator's
 * read-only integrity guard); the query service and the chain allocator never mutate the ledger.
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
    // P2-R016B-B1 — the chain allocator reads the ledger (count/aggregate/findFirst) to prove
    // head↔ledger consistency before allocating. Read-only; asserted below.
    'audit-chain.service.ts',
    // P2-R016B-C — the integrity monitor reads the ledger (groupBy/count/aggregate/findFirst/findUnique)
    // to run report-only verification sweeps. Read-only; asserted below.
    'audit-integrity-monitor.service.ts',
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

  it('the chain allocator reads the ledger for its integrity guard but never mutates auditEvent', () => {
    const src = fs.readFileSync(path.join(AUDIT_DIR, 'audit-chain.service.ts'), 'utf8');
    expect(src).toMatch(ACCESSOR); // it reads (count/aggregate/findFirst) for the B1 guard
    expect(src).not.toMatch(MUTATION); // ...but never creates/updates/deletes auditEvent rows
  });

  it('the integrity monitor reads the ledger for its sweeps but never mutates auditEvent', () => {
    const src = fs.readFileSync(path.join(AUDIT_DIR, 'audit-integrity-monitor.service.ts'), 'utf8');
    expect(src).toMatch(ACCESSOR); // it reads (groupBy/count/aggregate/findFirst/findUnique) to verify
    expect(src).not.toMatch(MUTATION); // ...report-only; never writes the ledger
  });

  it('the query controller has no Prisma dependency and no ledger accessor', () => {
    const src = fs.readFileSync(path.join(AUDIT_DIR, 'query', 'audit-query.controller.ts'), 'utf8');
    expect(src).not.toMatch(/PrismaService/);
    expect(src).not.toMatch(ACCESSOR);
  });

  it('the query service writes no auditEvent directly and invokes no verifier (capture goes via the recorder)', () => {
    const src = fs.readFileSync(path.join(AUDIT_DIR, 'query', 'audit-query.service.ts'), 'utf8');
    // P2-7C: the service DOES import AuditRecorder to emit fail-closed PHI read-access capture, but it
    // must never write the ledger directly, run a raw tx, or touch the verifier.
    expect(src).not.toMatch(MUTATION); // no direct auditEvent.create/update/delete/etc
    expect(src).not.toContain('$executeRaw');
    expect(src).not.toContain('$transaction'); // the recorder owns the capture tx, not the query service
    expect(src).not.toMatch(/from '[^']*audit-verification'/);
    expect(src).not.toMatch(/verifyChain\(/);
    // Read accessors present; capture delegated to the recorder helper.
    expect(src).toMatch(/auditEvent\.findMany/);
    expect(src).toMatch(/auditEvent\.findFirst/);
    expect(src).toMatch(/recordAuditEventPhiAccessed/);
  });
});
