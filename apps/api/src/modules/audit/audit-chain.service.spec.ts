import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditRecordInput } from './audit.contract';
import { AuditPersistenceService } from './audit-persistence.service';
import { AuditChainService } from './audit-chain.service';
import { GENESIS_PREV_HASH } from './audit-chain';

/**
 * Program 2 · P2-4C — chain activation against the local DB. Exercises AuditPersistenceService.append
 * directly on a supplied transaction (the CRITICAL_TRANSACTIONAL shape): genesis, linking, gapless
 * concurrency, cross-chain independence, rollback, and the UNIQUE(chainId, sequence) guard.
 */
const prisma = new PrismaClient();
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
