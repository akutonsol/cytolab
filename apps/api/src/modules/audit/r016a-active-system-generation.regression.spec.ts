/**
 * R-016a — active SYSTEM generation regression. Runs ONLY in the isolated test database.
 *
 * Proves the write-path fix: with the frozen generation-0 "system" chain in the corrupted
 * headless-history state (events, no head — the production condition), new SYSTEM audit writes route
 * to the ACTIVE generation, genesis-allocate cleanly, stay contiguous under concurrency, and NEVER
 * touch or reconnect to the frozen legacy segment.
 *
 * Boundary: this checkpoint does NOT change monitor/verifier semantics — the frozen "system" chain
 * remains reportable as compromised under unchanged rules (R-016b). Historical rows are never mutated.
 */
import { createTestPrisma, resetIsolatedChain } from '@test/test-database';
import { AuditChainService } from './audit-chain.service';
import { deriveChainId, ACTIVE_SYSTEM_CHAIN_ID, LEGACY_SYSTEM_CHAIN_ID } from './audit-chain';

const prisma = createTestPrisma();
const chain = new AuditChainService();
const H = (c: string) => c.repeat(64);

const insertRaw = (chainId: string, sequence: bigint, prevHash: string, selfHash: string) =>
  prisma.auditEvent.create({
    data: {
      occurredAt: new Date(), eventVersion: 1, category: 'SYSTEM', severity: 'INFO',
      dataClass: 'INTERNAL', retentionClass: 'EXTENDED', durabilityClass: 'OPERATIONAL',
      actorType: 'SYSTEM', organizationScope: 'SYSTEM', resourceType: 'Job', actionCode: 'JOB_STARTED',
      outcome: 'SUCCESS', producerModule: 'r016a-regression',
      chainId, sequence, prevHash, selfHash, hashAlgorithm: 'sha256/v1',
    },
  });

const appendOne = (chainId: string, selfHash: string) =>
  prisma.$transaction(async (tx) => {
    const alloc = await chain.allocate(tx as never, chainId);
    await (tx as never as typeof prisma).auditEvent.create({
      data: {
        occurredAt: new Date(), eventVersion: 1, category: 'SYSTEM', severity: 'INFO',
        dataClass: 'INTERNAL', retentionClass: 'EXTENDED', durabilityClass: 'OPERATIONAL',
        actorType: 'SYSTEM', organizationScope: 'SYSTEM', resourceType: 'Job', actionCode: 'JOB_STARTED',
        outcome: 'SUCCESS', producerModule: 'r016a-regression',
        chainId, sequence: alloc.sequence, prevHash: alloc.prevHash, selfHash, hashAlgorithm: 'sha256/v1',
      },
    });
    await chain.advance(tx as never, chainId, alloc.sequence, selfHash);
    return alloc.sequence.toString();
  });

beforeAll(async () => {
  await resetIsolatedChain(prisma, ACTIVE_SYSTEM_CHAIN_ID);
  await resetIsolatedChain(prisma, LEGACY_SYSTEM_CHAIN_ID);
  // Reproduce the production defect: a frozen legacy segment with events but NO head.
  await insertRaw(LEGACY_SYSTEM_CHAIN_ID, 1n, H('0'), H('a'));
  await insertRaw(LEGACY_SYSTEM_CHAIN_ID, 2n, H('z'), H('b')); // deliberately broken interior link
});
afterAll(async () => {
  await resetIsolatedChain(prisma, ACTIVE_SYSTEM_CHAIN_ID);
  await resetIsolatedChain(prisma, LEGACY_SYSTEM_CHAIN_ID);
  await prisma.$disconnect();
});

describe('R-016a — active SYSTEM generation restores the write path', () => {
  it('deriveChainId(SYSTEM) routes to the ACTIVE generation, never the frozen legacy chain', () => {
    expect(deriveChainId('SYSTEM', null)).toBe(ACTIVE_SYSTEM_CHAIN_ID);
    expect(deriveChainId('SYSTEM', null)).not.toBe(LEGACY_SYSTEM_CHAIN_ID);
  });

  it('the frozen legacy "system" segment is headless with surviving events (the R-016 condition)', async () => {
    expect(await prisma.auditChainHead.findUnique({ where: { chainId: LEGACY_SYSTEM_CHAIN_ID } })).toBeNull();
    expect(await prisma.auditEvent.count({ where: { chainId: LEGACY_SYSTEM_CHAIN_ID } })).toBe(2);
  });

  it('a SYSTEM append genesis-allocates on the ACTIVE generation despite the corrupted legacy segment', async () => {
    const seq = await appendOne(ACTIVE_SYSTEM_CHAIN_ID, H('1'));
    expect(seq).toBe('1'); // genesis on a fresh, consistent chain — no HEADLESS_HISTORY
    const head = await prisma.auditChainHead.findUnique({ where: { chainId: ACTIVE_SYSTEM_CHAIN_ID } });
    expect(head!.lastSequence).toBe(1n);
    expect(head!.lastSelfHash).toBe(H('1'));
  });

  it('concurrent SYSTEM appends stay contiguous on the ACTIVE chain — no gaps, no duplicates', async () => {
    await Promise.all([H('2'), H('3'), H('4'), H('5')].map((h) => appendOne(ACTIVE_SYSTEM_CHAIN_ID, h)));
    const rows = await prisma.auditEvent.findMany({
      where: { chainId: ACTIVE_SYSTEM_CHAIN_ID }, orderBy: { sequence: 'asc' }, select: { sequence: true },
    });
    expect(rows.map((r) => r.sequence!.toString())).toEqual(['1', '2', '3', '4', '5']); // 1..5, contiguous
    const head = await prisma.auditChainHead.findUnique({ where: { chainId: ACTIVE_SYSTEM_CHAIN_ID } });
    expect(head!.lastSequence).toBe(5n);
  });

  it('the frozen legacy segment is never touched or reconnected by active writes', async () => {
    // No active write landed on the legacy chain, and it still has no head (unchanged, immutable).
    expect(await prisma.auditEvent.count({ where: { chainId: LEGACY_SYSTEM_CHAIN_ID } })).toBe(2);
    expect(await prisma.auditChainHead.findUnique({ where: { chainId: LEGACY_SYSTEM_CHAIN_ID } })).toBeNull();
    // Every producer-marked active row is on the active chain, none on the legacy chain.
    expect(await prisma.auditEvent.count({ where: { producerModule: 'r016a-regression', chainId: LEGACY_SYSTEM_CHAIN_ID } })).toBe(2); // only the 2 seeded
    expect(await prisma.auditEvent.count({ where: { producerModule: 'r016a-regression', chainId: ACTIVE_SYSTEM_CHAIN_ID } })).toBe(5);
  });
});
