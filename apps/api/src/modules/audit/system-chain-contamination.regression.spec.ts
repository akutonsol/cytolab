/**
 * Program 2 · P2-R016A — recurrence regression for the R-016 SYSTEM-chain contamination. Runs ONLY in
 * the isolated test database (createTestPrisma fail-closes otherwise). It proves (1) the isolation
 * guard makes the former shared-head teardown impossible to target the dev database, and (2) on a clean
 * isolated SYSTEM chain the append allocator is contiguous with a present, consistent head — i.e. the
 * collision-on-missing-head fingerprint cannot recur here.
 */
import {
  createTestPrisma,
  resetIsolatedChain,
  assertIsolatedTestDatabase,
  resolveTestDatabaseUrl,
  redactDbUrl,
  TestDatabaseIsolationError,
} from '@test/test-database';
import { AuditChainService } from './audit-chain.service';

const prisma = createTestPrisma();
const chain = new AuditChainService();
const SYSTEM = 'system';
const H = (c: string) => c.repeat(64);

beforeAll(() => resetIsolatedChain(prisma, SYSTEM));
afterAll(async () => {
  await resetIsolatedChain(prisma, SYSTEM);
  await prisma.$disconnect();
});

describe('P2-R016A — SYSTEM-chain contamination cannot recur', () => {
  it('the isolation guard blocks the former shared-head teardown from ever targeting the dev database', () => {
    expect(() => assertIsolatedTestDatabase('postgresql://u:p@localhost:5432/cytolab')).toThrow(
      TestDatabaseIsolationError,
    );
    // Tests themselves only ever resolve to a *_test database.
    expect(redactDbUrl(resolveTestDatabaseUrl())).toMatch(/test/);
  });

  it('starts from a clean isolated SYSTEM chain (no head, no rows) after reset', async () => {
    expect(await prisma.auditChainHead.findUnique({ where: { chainId: SYSTEM } })).toBeNull();
    expect(await prisma.auditEvent.count({ where: { chainId: SYSTEM } })).toBe(0);
  });

  it('allocates SYSTEM sequences contiguously with a present, consistent head (no collision)', async () => {
    const seqs: string[] = [];
    for (const hash of [H('a'), H('b'), H('c')]) {
      await prisma.$transaction(async (tx) => {
        const alloc = await chain.allocate(tx as never, SYSTEM);
        seqs.push(alloc.sequence.toString());
        await chain.advance(tx as never, SYSTEM, alloc.sequence, hash);
      });
    }
    expect(seqs).toEqual(['1', '2', '3']); // contiguous — the missing-head collision cannot occur
    const head = await prisma.auditChainHead.findUnique({ where: { chainId: SYSTEM } });
    expect(head).not.toBeNull();
    expect(head!.lastSequence).toBe(3n);
    expect(head!.lastSelfHash).toBe(H('c'));
  });

  it('a guarded reset clears the shared chain safely, and the next SYSTEM append succeeds', async () => {
    await resetIsolatedChain(prisma, SYSTEM); // the sanctioned reset (isolated DB only)
    expect(await prisma.auditChainHead.findUnique({ where: { chainId: SYSTEM } })).toBeNull();
    const next = await prisma.$transaction(async (tx) => {
      const alloc = await chain.allocate(tx as never, SYSTEM);
      await chain.advance(tx as never, SYSTEM, alloc.sequence, H('d'));
      return alloc.sequence.toString();
    });
    expect(next).toBe('1'); // clean slate → genesis again, no unique-constraint collision
  });
});
