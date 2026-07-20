import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { AuditRecordInput } from './audit.contract';
import { AuditPersistenceService } from './audit-persistence.service';
import { AuditChainService } from './audit-chain.service';
import { AuditVerificationService } from './audit-verification.service';
import { AuditIntegrityMonitorService } from './audit-integrity-monitor.service';

/**
 * Program 2 · P2-R016B-C — integrity monitor. Read-only verification sweeps against the isolated test
 * database (createTestPrisma fail-closes otherwise). Covers the deep defects the O(1) B1 writer guard
 * cannot detect (interior tampering under a consistent head), plus head↔ledger correspondence,
 * sweep aggregation/state, overlap, bounded concurrency, log safety, and stability.
 */
const prisma = createTestPrisma();
const chain = new AuditChainService();
const persistence = new AuditPersistenceService(prisma as unknown as PrismaService, chain);
const verifier = new AuditVerificationService(prisma as unknown as PrismaService);
const monitor = new AuditIntegrityMonitorService(verifier, prisma as unknown as PrismaService);

const MARKER = 'p2-r016b-c-it';
const PREFIX = 'lab:itc-';
const HEX = (c: string) => c.repeat(64);
const cid = (labId: string) => `lab:${labId}`;

function mkInput(labId: string, over: Partial<AuditRecordInput> = {}): AuditRecordInput {
  return {
    category: 'RECORD_LIFECYCLE',
    action: { code: 'RECORD_CREATED' },
    actor: { type: 'STAFF', id: 'u-itc' },
    organization: { scope: 'LAB', labId },
    resource: { type: 'Record', id: 'rec-itc' },
    outcome: { status: 'SUCCESS' },
    producerModule: MARKER,
    ...over,
  };
}
const appendTx = (inp: AuditRecordInput) => prisma.$transaction((tx) => persistence.append(inp, tx as any));
const build = async (labId: string, n: number) => {
  for (let i = 0; i < n; i++) await appendTx(mkInput(labId));
};

const deleteHead = (chainId: string) => prisma.$executeRaw`DELETE FROM "AuditChainHead" WHERE "chainId" = ${chainId}`;
const setHead = (chainId: string, lastSequence: bigint, lastSelfHash: string) =>
  prisma.$executeRaw`UPDATE "AuditChainHead" SET "lastSequence" = ${lastSequence}, "lastSelfHash" = ${lastSelfHash} WHERE "chainId" = ${chainId}`;
const insertHead = (chainId: string, lastSequence: bigint, lastSelfHash: string) =>
  prisma.$executeRaw`INSERT INTO "AuditChainHead" ("chainId","lastSequence","lastSelfHash","updatedAt") VALUES (${chainId}, ${lastSequence}, ${lastSelfHash}, NOW())`;
const setEventPrevHash = (chainId: string, sequence: bigint, prevHash: string) =>
  prisma.$executeRaw`UPDATE "AuditEvent" SET "prevHash" = ${prevHash} WHERE "chainId" = ${chainId} AND "sequence" = ${sequence}`;
const setEventSelfHash = (chainId: string, sequence: bigint, selfHash: string) =>
  prisma.$executeRaw`UPDATE "AuditEvent" SET "selfHash" = ${selfHash} WHERE "chainId" = ${chainId} AND "sequence" = ${sequence}`;
const deleteEvent = (chainId: string, sequence: bigint) =>
  prisma.$executeRaw`DELETE FROM "AuditEvent" WHERE "chainId" = ${chainId} AND "sequence" = ${sequence}`;

async function cleanup() {
  await prisma.auditEvent.deleteMany({ where: { producerModule: MARKER } });
  await prisma.$executeRaw`DELETE FROM "AuditChainHead" WHERE "chainId" LIKE ${PREFIX + '%'}`;
}
beforeAll(cleanup);
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('AuditIntegrityMonitor — per-chain assessment', () => {
  it('a fully healthy chain reports VERIFIED', async () => {
    await build('healthy', 4);
    const a = await monitor.assessChain(cid('healthy'));
    expect(a.status).toBe('VERIFIED');
    expect(a.reason).toBeNull();
    expect(a.eventCount).toBe(4);
  });

  it('a broken INTERIOR prevHash is COMPROMISED even though head and terminal still match (the B1 residual)', async () => {
    await build('interior', 5); // head@5 matches event5
    await setEventPrevHash(cid('interior'), 3n, HEX('a')); // tamper an interior link only
    const a = await monitor.assessChain(cid('interior'));
    expect(a.status).toBe('COMPROMISED');
    expect(a.reason).toBe('prev_hash_mismatch');
    // Head still matches the terminal — B1's O(1) guard would NOT catch this; the monitor does.
    const head = await prisma.auditChainHead.findUnique({ where: { chainId: cid('interior') } });
    expect(head!.lastSequence).toBe(5n);
  });

  it('a tampered selfHash is COMPROMISED', async () => {
    await build('selfhash', 3);
    await setEventSelfHash(cid('selfhash'), 2n, HEX('b'));
    const a = await monitor.assessChain(cid('selfhash'));
    expect(a.status).toBe('COMPROMISED');
    expect(['self_hash_mismatch', 'prev_hash_mismatch']).toContain(a.reason); // tamper detected at/after seq2
  });

  it('a missing sequence is COMPROMISED', async () => {
    await build('gap', 5);
    await deleteEvent(cid('gap'), 3n);
    const a = await monitor.assessChain(cid('gap'));
    expect(a.status).toBe('COMPROMISED');
    expect(a.reason).toBe('missing_sequence');
  });

  it('headless history (events, no head) is COMPROMISED', async () => {
    await build('headless', 3);
    await deleteHead(cid('headless'));
    const a = await monitor.assessChain(cid('headless'));
    expect(a.status).toBe('COMPROMISED');
    expect(a.reason).toBe('headless_history');
  });

  it('a stale head is COMPROMISED', async () => {
    await build('stale', 3);
    await setHead(cid('stale'), 9n, HEX('c'));
    const a = await monitor.assessChain(cid('stale'));
    expect(a.status).toBe('COMPROMISED');
    expect(a.reason).toBe('head_terminal_mismatch');
  });

  it('a head over an empty ledger is COMPROMISED', async () => {
    await insertHead(cid('nohist'), 5n, HEX('d'));
    const a = await monitor.assessChain(cid('nohist'));
    expect(a.status).toBe('COMPROMISED');
    expect(a.reason).toBe('head_without_history');
  });

  it('a query/verifier failure yields MONITORING_ERROR, not a corruption verdict', async () => {
    await build('dberr', 2);
    jest.spyOn(verifier, 'verifyChain').mockRejectedValueOnce(new Error('connection reset'));
    const a = await monitor.assessChain(cid('dberr'));
    expect(a.status).toBe('MONITORING_ERROR');
    expect(a.reason).toContain('monitoring_error');
  });

  it('a chain that changes DURING verification is INCONCLUSIVE (never reported clean from an unstable read)', async () => {
    await build('unstable', 2);
    // Simulate a concurrent tail append happening while verification runs.
    jest.spyOn(verifier, 'verifyChain').mockImplementationOnce(async () => {
      await appendTx(mkInput('unstable')); // mutate between the before/after fingerprints
      return { chainId: cid('unstable'), verified: true, checkedCount: 2, legacyCount: 0, range: { fromSequence: null, toSequence: null } };
    });
    const a = await monitor.assessChain(cid('unstable'));
    expect(a.status).toBe('INCONCLUSIVE');
    expect(a.reason).toBe('chain_changed_during_verification');
  });
});

describe('AuditIntegrityMonitor — sweep, state, safety', () => {
  it('startup state is PENDING; a sweep transitions it to a final state', async () => {
    const fresh = new AuditIntegrityMonitorService(verifier, prisma as unknown as PrismaService);
    expect(fresh.getState()).toBe('PENDING');
    await build('final-ok', 2);
    const report = await fresh.runSweep('manual', [cid('final-ok')]);
    expect(report.state).toBe('HEALTHY');
    expect(fresh.getState()).toBe('HEALTHY');
  });

  it('one compromised chain does not prevent verification of the others', async () => {
    await build('multi-ok', 2);
    await build('multi-bad', 3);
    await deleteHead(cid('multi-bad')); // headless → compromised
    const report = await monitor.runSweep('manual', [cid('multi-ok'), cid('multi-bad')]);
    expect(report.totalChains).toBe(2);
    expect(report.verified).toBe(1);
    expect(report.compromised).toBe(1);
    expect(report.compromisedChainIds).toEqual([cid('multi-bad')]);
    expect(report.state).toBe('DEGRADED');
    expect(report.failuresByKind.headless_history).toBe(1);
  });

  it('scheduled sweeps do not overlap (the second early-returns without a second pass)', async () => {
    // Fresh monitor so the overlap early-return (lastReport ?? emptyReport) is deterministic (no prior report).
    const m = new AuditIntegrityMonitorService(verifier, prisma as unknown as PrismaService);
    const spy = jest.spyOn(m, 'assessChain').mockImplementation(async (chainId) => {
      await new Promise((r) => setTimeout(r, 40));
      return { chainId, status: 'VERIFIED', reason: null, eventCount: 1, maxSequence: '1', headPresent: true };
    });
    const first = m.runSweep('manual', ['x', 'y']); // sets running=true, holds ~40ms
    const second = await m.runSweep('manual', ['x', 'y']); // running=true → early return
    await first;
    expect(second.totalChains).toBe(0); // the overlapping call did not process any chain
    expect(spy).toHaveBeenCalledTimes(2); // only the first sweep's two chains
  });

  it('verification concurrency is bounded (never an unbounded Promise.all)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    jest.spyOn(monitor, 'assessChain').mockImplementation(async (chainId) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return { chainId, status: 'VERIFIED', reason: null, eventCount: 1, maxSequence: '1', headPresent: true };
    });
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    await monitor.runSweep('manual', ids);
    expect(maxInFlight).toBeGreaterThan(1); // it is parallel
    expect(maxInFlight).toBeLessThanOrEqual(4); // ...but bounded at the default limit
  });

  it('logs and metrics carry only chain identifiers and counts — never event payloads or hashes', async () => {
    await build('logsafe-ok', 2);
    await build('logsafe-bad', 2);
    await setEventPrevHash(cid('logsafe-bad'), 2n, HEX('e'));
    const errs: string[] = [];
    const logs: string[] = [];
    jest.spyOn(monitor['logger'], 'error').mockImplementation((m: any) => void errs.push(String(m)));
    jest.spyOn(monitor['logger'], 'log').mockImplementation((m: any) => void logs.push(String(m)));
    jest.spyOn(monitor['logger'], 'warn').mockImplementation(() => undefined);
    await monitor.runSweep('manual', [cid('logsafe-ok'), cid('logsafe-bad')]);
    const all = [...errs, ...logs].join('\n');
    expect(all).toContain(cid('logsafe-bad')); // chain id present
    expect(all).toContain('prev_hash_mismatch'); // reason kind present
    expect(all).not.toMatch(/[a-f0-9]{64}/); // no full hashes
    expect(all).not.toMatch(/patientRef|actorId|scopeLabId|payload|"metadata"/); // no sensitive fields
  });

  it('the health facet reflects the cached state and exposes the compromised chain', async () => {
    await build('facet-bad', 2);
    await deleteHead(cid('facet-bad'));
    await monitor.runSweep('manual', [cid('facet-bad')]);
    const facet = monitor.getHealthFacet();
    expect(facet.status).toBe('error');
    expect(facet.message).toContain(cid('facet-bad'));
  });
});

describe('AuditIntegrityMonitor — system-shape and healthy-shape (isolated analogs of the dev chains)', () => {
  it('a compromised system-shape chain reports COMPROMISED and is left unchanged', async () => {
    // Reproduce the dev system shape: re-genesis (seq1) + orphan with a dangling interior link, headless.
    await build('sys', 1); // seq1
    await prisma.auditEvent.create({
      data: {
        occurredAt: new Date(), eventVersion: 1, category: 'RECORD_LIFECYCLE', severity: 'INFO',
        dataClass: 'CONFIDENTIAL', retentionClass: 'EXTENDED', durabilityClass: 'OPERATIONAL', actorType: 'STAFF',
        organizationScope: 'LAB', scopeLabId: 'itc-sys', resourceType: 'Record', actionCode: 'RECORD_CREATED',
        outcome: 'SUCCESS', producerModule: MARKER, chainId: cid('sys'), sequence: 2n,
        prevHash: HEX('a'), selfHash: HEX('b'), hashAlgorithm: 'sha256/v1',
      },
    });
    await deleteHead(cid('sys'));
    const before = await prisma.auditEvent.count({ where: { chainId: cid('sys') } });
    const a = await monitor.assessChain(cid('sys'));
    expect(a.status).toBe('COMPROMISED');
    expect(await prisma.auditEvent.count({ where: { chainId: cid('sys') } })).toBe(before); // unchanged
    expect(await prisma.auditChainHead.findUnique({ where: { chainId: cid('sys') } })).toBeNull();
  });

  it('a healthy multi-event chain reports VERIFIED and is left unchanged', async () => {
    await build('healthy-shape', 6);
    const before = {
      count: await prisma.auditEvent.count({ where: { chainId: cid('healthy-shape') } }),
      head: await prisma.auditChainHead.findUnique({ where: { chainId: cid('healthy-shape') } }),
    };
    const a = await monitor.assessChain(cid('healthy-shape'));
    expect(a.status).toBe('VERIFIED');
    const after = {
      count: await prisma.auditEvent.count({ where: { chainId: cid('healthy-shape') } }),
      head: await prisma.auditChainHead.findUnique({ where: { chainId: cid('healthy-shape') } }),
    };
    expect(after.count).toBe(before.count);
    expect(after.head!.lastSelfHash).toBe(before.head!.lastSelfHash);
  });
});
