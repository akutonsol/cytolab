import { PrismaClient } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { AuditRecordInput } from './audit.contract';
import { AuditPersistenceService } from './audit-persistence.service';
import { AuditChainService, AuditChainIntegrityError } from './audit-chain.service';
import { GENESIS_PREV_HASH } from './audit-chain';

/**
 * Program 2 · P2-4C — chain activation against the local DB. Exercises AuditPersistenceService.append
 * directly on a supplied transaction (the CRITICAL_TRANSACTIONAL shape): genesis, linking, gapless
 * concurrency, cross-chain independence, rollback, and the UNIQUE(chainId, sequence) guard.
 */
const prisma = createTestPrisma();
const chain = new AuditChainService();
const persistence = new AuditPersistenceService(prisma as unknown as PrismaService, chain);

const MARKER = 'p2-4c-chain-it';
const CHAIN_PREFIX = 'lab:it-'; // every test lab is "it-*", so cleanup is prefix-scoped

function mkInput(labId: string, over: Partial<AuditRecordInput> = {}): AuditRecordInput {
  return {
    category: 'RECORD_LIFECYCLE',
    action: { code: 'RECORD_CREATED' }, // OPERATIONAL, no metadata contract
    actor: { type: 'STAFF', id: 'u-it' },
    organization: { scope: 'LAB', labId },
    resource: { type: 'Record', id: 'rec-it' },
    outcome: { status: 'SUCCESS' },
    producerModule: MARKER,
    ...over,
  };
}

const appendTx = (inp: AuditRecordInput) =>
  prisma.$transaction((tx) => persistence.append(inp, tx as any));

async function cleanup() {
  await prisma.auditEvent.deleteMany({ where: { producerModule: MARKER } });
  await prisma.$executeRaw`DELETE FROM "AuditChainHead" WHERE "chainId" LIKE ${CHAIN_PREFIX + '%'}`;
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('AuditChainService — genesis and linking', () => {
  it('genesis: first event gets sequence 1, zero prevHash, a valid selfHash, and advances the head', async () => {
    const id = await appendTx(mkInput('it-gen'));
    const row = await prisma.auditEvent.findUnique({ where: { id } });
    expect(row!.chainId).toBe('lab:it-gen');
    expect(row!.sequence).toBe(1n);
    expect(row!.prevHash).toBe(GENESIS_PREV_HASH);
    expect(row!.selfHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row!.hashAlgorithm).toBe('sha256/v1');

    const head = await prisma.auditChainHead.findUnique({ where: { chainId: 'lab:it-gen' } });
    expect(head!.lastSequence).toBe(1n);
    expect(head!.lastSelfHash).toBe(row!.selfHash);
  });

  it('second event: sequence 2 with prevHash equal to the first selfHash; head advances', async () => {
    const id1 = await appendTx(mkInput('it-2nd'));
    const row1 = await prisma.auditEvent.findUnique({ where: { id: id1 } });
    const id2 = await appendTx(mkInput('it-2nd'));
    const row2 = await prisma.auditEvent.findUnique({ where: { id: id2 } });

    expect(row2!.sequence).toBe(2n);
    expect(row2!.prevHash).toBe(row1!.selfHash);
    const head = await prisma.auditChainHead.findUnique({ where: { chainId: 'lab:it-2nd' } });
    expect(head!.lastSequence).toBe(2n);
    expect(head!.lastSelfHash).toBe(row2!.selfHash);
  });
});

describe('AuditChainService — concurrency and independence', () => {
  it('same-chain concurrent appends allocate contiguous, unique sequences', async () => {
    await Promise.all([appendTx(mkInput('it-cc')), appendTx(mkInput('it-cc')), appendTx(mkInput('it-cc'))]);
    const rows = await prisma.auditEvent.findMany({
      where: { producerModule: MARKER, chainId: 'lab:it-cc' },
      orderBy: { sequence: 'asc' },
    });
    expect(rows.map((r) => r.sequence)).toEqual([1n, 2n, 3n]);
    // links are contiguous
    expect(rows[1].prevHash).toBe(rows[0].selfHash);
    expect(rows[2].prevHash).toBe(rows[1].selfHash);
  });

  it('different chains allocate independent sequence-1 events', async () => {
    const [ix, iy] = await Promise.all([appendTx(mkInput('it-x')), appendTx(mkInput('it-y'))]);
    const rx = await prisma.auditEvent.findUnique({ where: { id: ix } });
    const ry = await prisma.auditEvent.findUnique({ where: { id: iy } });
    expect(rx!.sequence).toBe(1n);
    expect(ry!.sequence).toBe(1n);
    expect(rx!.chainId).not.toBe(ry!.chainId);
  });
});

describe('AuditChainService — rollback and uniqueness', () => {
  it('a rolled-back append leaves no event, does not advance the head, and the sequence is reused', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await persistence.append(mkInput('it-rb'), tx as any);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    // No event, and the seed head row was rolled back too.
    expect(await prisma.auditEvent.count({ where: { chainId: 'lab:it-rb' } })).toBe(0);
    expect(await prisma.auditChainHead.findUnique({ where: { chainId: 'lab:it-rb' } })).toBeNull();

    // The next successful append reuses sequence 1 (no gap consumed).
    const id = await appendTx(mkInput('it-rb'));
    const row = await prisma.auditEvent.findUnique({ where: { id } });
    expect(row!.sequence).toBe(1n);
    expect(row!.prevHash).toBe(GENESIS_PREV_HASH);
  });

  it('UNIQUE(chainId, sequence) is enforced against a duplicate insert', async () => {
    const id = await appendTx(mkInput('it-uniq'));
    const row = await prisma.auditEvent.findUnique({ where: { id } });
    await expect(
      prisma.auditEvent.create({
        data: {
          occurredAt: new Date(),
          eventVersion: 1,
          category: 'RECORD_LIFECYCLE',
          severity: 'INFO',
          dataClass: 'CONFIDENTIAL',
          retentionClass: 'EXTENDED',
          durabilityClass: 'OPERATIONAL',
          actorType: 'STAFF',
          organizationScope: 'LAB',
          scopeLabId: 'it-uniq',
          resourceType: 'Record',
          actionCode: 'RECORD_CREATED',
          outcome: 'SUCCESS',
          producerModule: MARKER,
          chainId: row!.chainId, // same chain
          sequence: row!.sequence, // duplicate sequence
        },
      }),
    ).rejects.toThrow();
  });
});

describe('AuditChainService — P2-R016B-B1 fail-closed integrity guard', () => {
  const cid = (labId: string) => `lab:${labId}`;
  const setHead = (chainId: string, lastSequence: bigint, lastSelfHash: string) =>
    prisma.$executeRaw`UPDATE "AuditChainHead" SET "lastSequence" = ${lastSequence}, "lastSelfHash" = ${lastSelfHash} WHERE "chainId" = ${chainId}`;
  const deleteHead = (chainId: string) =>
    prisma.$executeRaw`DELETE FROM "AuditChainHead" WHERE "chainId" = ${chainId}`;
  const insertHead = (chainId: string, lastSequence: bigint, lastSelfHash: string) =>
    prisma.$executeRaw`INSERT INTO "AuditChainHead" ("chainId","lastSequence","lastSelfHash","updatedAt") VALUES (${chainId}, ${lastSequence}, ${lastSelfHash}, NOW())`;
  const deleteEvent = (chainId: string, sequence: bigint) =>
    prisma.$executeRaw`DELETE FROM "AuditEvent" WHERE "chainId" = ${chainId} AND "sequence" = ${sequence}`;

  async function expectIncident(fn: () => Promise<unknown>, kind: string) {
    let err: any;
    try {
      await fn();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AuditChainIntegrityError);
    expect(err.kind).toBe(kind);
    return err;
  }

  // ── Permitted states ──────────────────────────────────────────────────────────────────────
  it('empty chain initialises exactly once, and concurrent empty-chain writers form one lineage', async () => {
    // Concurrent writers on a brand-new chain must yield a single contiguous genesis lineage.
    await Promise.all([appendTx(mkInput('it-b1-empty')), appendTx(mkInput('it-b1-empty')), appendTx(mkInput('it-b1-empty'))]);
    const rows = await prisma.auditEvent.findMany({ where: { chainId: cid('it-b1-empty') }, orderBy: { sequence: 'asc' } });
    expect(rows.map((r) => r.sequence)).toEqual([1n, 2n, 3n]);
    expect(rows[1].prevHash).toBe(rows[0].selfHash);
    expect(rows[2].prevHash).toBe(rows[1].selfHash);
  });

  it('a healthy chain keeps allocating and continues to verify after a controlled append', async () => {
    await appendTx(mkInput('it-b1-healthy'));
    await appendTx(mkInput('it-b1-healthy'));
    await appendTx(mkInput('it-b1-healthy')); // head@3
    const id4 = await appendTx(mkInput('it-b1-healthy')); // controlled 4th append
    const rows = await prisma.auditEvent.findMany({ where: { chainId: cid('it-b1-healthy') }, orderBy: { sequence: 'asc' } });
    expect(rows.map((r) => r.sequence)).toEqual([1n, 2n, 3n, 4n]);
    // linkage intact end-to-end
    for (let i = 1; i < rows.length; i++) expect(rows[i].prevHash).toBe(rows[i - 1].selfHash);
    const head = await prisma.auditChainHead.findUnique({ where: { chainId: cid('it-b1-healthy') } });
    const terminal = await prisma.auditEvent.findUnique({ where: { id: id4 } });
    expect(head!.lastSequence).toBe(4n);
    expect(head!.lastSelfHash).toBe(terminal!.selfHash);
  });

  // ── Fail-closed states ────────────────────────────────────────────────────────────────────
  it('HEADLESS_HISTORY: missing head with surviving events fails closed (the R-016 condition)', async () => {
    await appendTx(mkInput('it-b1-headless')); // head@1 + event seq1
    await deleteHead(cid('it-b1-headless')); // simulate the R-016 teardown
    const err = await expectIncident(() => appendTx(mkInput('it-b1-headless')), 'HEADLESS_HISTORY');
    expect(err.recoverable).toBe('NO'); // only an authorized generation rollover can continue this chain
  });

  it('broken-predecessor / system-chain shape (headless with dangling internal link) fails closed', async () => {
    // Reproduce the dev system shape in isolation: a re-genesis (seq1) plus surviving orphan events
    // whose prevHash dangles, and NO head. The guard blocks it as HEADLESS_HISTORY before any
    // allocation — the deletion-induced break always manifests as head↔ledger inconsistency.
    await appendTx(mkInput('it-b1-broken')); // seq1 (re-genesis), head@1
    const s1 = await prisma.auditEvent.findFirst({ where: { chainId: cid('it-b1-broken'), sequence: 1n } });
    // manually add orphan events seq2 (dangling prevHash) → seq3, then remove the head
    await prisma.auditEvent.create({
      data: {
        occurredAt: new Date(), eventVersion: 1, category: 'RECORD_LIFECYCLE', severity: 'INFO',
        dataClass: 'CONFIDENTIAL', retentionClass: 'EXTENDED', durabilityClass: 'OPERATIONAL', actorType: 'STAFF',
        organizationScope: 'LAB', scopeLabId: 'it-b1-broken', resourceType: 'Record', actionCode: 'RECORD_CREATED',
        outcome: 'SUCCESS', producerModule: MARKER, chainId: cid('it-b1-broken'), sequence: 2n,
        prevHash: 'a'.repeat(64), selfHash: 'b'.repeat(64), hashAlgorithm: 'sha256/v1',
      },
    });
    await deleteHead(cid('it-b1-broken'));
    void s1;
    await expectIncident(() => appendTx(mkInput('it-b1-broken')), 'HEADLESS_HISTORY');
  });

  it('HEAD_WITHOUT_HISTORY: a head that claims a sequence over an empty ledger fails closed', async () => {
    await insertHead(cid('it-b1-nohist'), 5n, GENESIS_PREV_HASH); // head, but no events
    await expectIncident(() => appendTx(mkInput('it-b1-nohist')), 'HEAD_WITHOUT_HISTORY');
  });

  it('HEAD_SEQUENCE_MISMATCH: a stale-ahead head fails closed', async () => {
    await appendTx(mkInput('it-b1-ahead')); // head@1
    await setHead(cid('it-b1-ahead'), 9n, GENESIS_PREV_HASH); // head ahead of the ledger
    const err = await expectIncident(() => appendTx(mkInput('it-b1-ahead')), 'HEAD_SEQUENCE_MISMATCH');
    expect(err.recoverable).toBe('DEPENDS'); // head/ledger step-mismatch may be reconcilable (subject to verification)
  });

  it('HEAD_SEQUENCE_MISMATCH: a stale-behind head fails closed', async () => {
    await appendTx(mkInput('it-b1-behind'));
    await appendTx(mkInput('it-b1-behind')); // head@2
    await setHead(cid('it-b1-behind'), 1n, GENESIS_PREV_HASH); // head behind the ledger terminal
    await expectIncident(() => appendTx(mkInput('it-b1-behind')), 'HEAD_SEQUENCE_MISMATCH');
  });

  it('MISSING_GENESIS: a ledger whose genesis event was removed fails closed', async () => {
    await appendTx(mkInput('it-b1-nogen'));
    await appendTx(mkInput('it-b1-nogen')); // head@2, events seq1,2
    await deleteEvent(cid('it-b1-nogen'), 1n); // remove genesis → min sequence becomes 2
    await expectIncident(() => appendTx(mkInput('it-b1-nogen')), 'MISSING_GENESIS');
  });

  it('SEQUENCE_DISCONTINUITY: a gap in the sequence space fails closed', async () => {
    await appendTx(mkInput('it-b1-gap'));
    await appendTx(mkInput('it-b1-gap'));
    await appendTx(mkInput('it-b1-gap')); // head@3, events seq1,2,3
    await deleteEvent(cid('it-b1-gap'), 2n); // gap at seq2; count(2) != head lastSequence(3)
    await expectIncident(() => appendTx(mkInput('it-b1-gap')), 'SEQUENCE_DISCONTINUITY');
  });

  it('HEAD_HASH_MISMATCH: a head whose selfHash disagrees with the terminal event fails closed', async () => {
    await appendTx(mkInput('it-b1-hash')); // head@1 matching event1
    await setHead(cid('it-b1-hash'), 1n, '0'.repeat(64)); // corrupt the head hash only
    await expectIncident(() => appendTx(mkInput('it-b1-hash')), 'HEAD_HASH_MISMATCH');
  });

  // ── Transaction / mutation semantics ──────────────────────────────────────────────────────
  it('CRITICAL_TRANSACTIONAL: an integrity incident rolls back the whole business transaction', async () => {
    await appendTx(mkInput('it-b1-crit'));
    await deleteHead(cid('it-b1-crit')); // now headless
    // A business tx that writes a marker event on ANOTHER (healthy) chain and then appends to the
    // headless chain must roll BOTH back when the guard fires.
    await expect(
      prisma.$transaction(async (tx) => {
        await persistence.append(mkInput('it-b1-crit-marker'), tx as any); // would succeed alone
        await persistence.append(mkInput('it-b1-crit'), tx as any); // headless → integrity incident
      }),
    ).rejects.toBeInstanceOf(AuditChainIntegrityError);
    // The marker chain was rolled back with the failing append — no partial state.
    expect(await prisma.auditEvent.count({ where: { chainId: cid('it-b1-crit-marker') } })).toBe(0);
    expect(await prisma.auditChainHead.findUnique({ where: { chainId: cid('it-b1-crit-marker') } })).toBeNull();
  });

  it('the inconsistent chain is NOT mutated by a failed (rolled-back) append', async () => {
    await appendTx(mkInput('it-b1-nomutate')); // head@1, event seq1
    await deleteHead(cid('it-b1-nomutate')); // headless
    const before = {
      head: await prisma.auditChainHead.findUnique({ where: { chainId: cid('it-b1-nomutate') } }),
      count: await prisma.auditEvent.count({ where: { chainId: cid('it-b1-nomutate') } }),
    };
    await expectIncident(() => appendTx(mkInput('it-b1-nomutate')), 'HEADLESS_HISTORY');
    const after = {
      head: await prisma.auditChainHead.findUnique({ where: { chainId: cid('it-b1-nomutate') } }),
      count: await prisma.auditEvent.count({ where: { chainId: cid('it-b1-nomutate') } }),
    };
    // Seed row was rolled back with the failed transaction — the chain remains exactly headless.
    expect(before.head).toBeNull();
    expect(after.head).toBeNull();
    expect(after.count).toBe(before.count);
  });
});
