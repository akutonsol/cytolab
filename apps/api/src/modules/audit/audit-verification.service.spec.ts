import { PrismaClient } from '@prisma/client';
import { createTestPrisma, resetIsolatedChain } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { AuditRecordInput } from './audit.contract';
import { AuditPersistenceService } from './audit-persistence.service';
import { AuditChainService } from './audit-chain.service';
import {
  AuditVerificationService,
  VerifiableAuditRow,
  verifyChainRows,
} from './audit-verification.service';
import { AuditCanonicalFields, computeSelfHash } from './audit-hash';
import { AUDIT_HASH_ALGORITHM, GENESIS_PREV_HASH } from './audit-chain';

// ---------------------------------------------------------------------------
// Pure core (no DB): every corruption kind, using synthetic rows with real hashes.
// ---------------------------------------------------------------------------

function canonical(seq: bigint, prevHash: string, over: Partial<AuditCanonicalFields> = {}): AuditCanonicalFields {
  return {
    id: `evt-${seq}`,
    occurredAt: new Date('2026-07-18T10:00:00.000Z'),
    recordedAt: new Date('2026-07-18T10:00:00.500Z'),
    schemaVersion: 1,
    eventVersion: 1,
    category: 'RECORD_LIFECYCLE',
    actionCode: 'RECORD_CREATED',
    detailCode: null,
    severity: 'NOTICE',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    retentionClass: 'EXTENDED',
    durabilityClass: 'OPERATIONAL',
    actorType: 'STAFF',
    actorId: 'u1',
    onBehalfOfActorId: null,
    servicePrincipal: null,
    organizationScope: 'LAB',
    scopeLabId: 'test',
    organizationId: null,
    resourceType: 'Record',
    resourceId: 'r1',
    resourceLabId: null,
    parentResourceType: null,
    parentResourceId: null,
    patientRef: null,
    outcome: 'SUCCESS',
    statusCode: null,
    errorCode: null,
    reasonCode: null,
    changedFields: [],
    beforeHash: null,
    afterHash: null,
    producerModule: 'records',
    executionId: null,
    hashAlgorithm: AUDIT_HASH_ALGORITHM,
    metadata: null,
    sequence: seq,
    chainId: 'lab:test',
    prevHash,
    ...over,
  };
}
/** A valid row whose selfHash is computed from its own fields. */
function row(seq: bigint, prevHash: string, over: Partial<AuditCanonicalFields> = {}): VerifiableAuditRow {
  const c = canonical(seq, prevHash, over);
  return { ...c, selfHash: computeSelfHash(c) };
}
const GENESIS = { sequence: 1n, prevHash: GENESIS_PREV_HASH };

/** Build a valid linked chain of length n starting at genesis. */
function validChain(n: number): VerifiableAuditRow[] {
  const rows: VerifiableAuditRow[] = [];
  let prev = GENESIS_PREV_HASH;
  for (let i = 1; i <= n; i++) {
    const r = row(BigInt(i), prev);
    rows.push(r);
    prev = r.selfHash!;
  }
  return rows;
}

describe('verifyChainRows (pure) — valid', () => {
  it('valid genesis-only chain verifies', () => {
    const res = verifyChainRows(validChain(1), GENESIS);
    expect(res.verified).toBe(true);
    expect(res.checkedCount).toBe(1);
  });
  it('valid multi-event chain verifies', () => {
    const res = verifyChainRows(validChain(4), GENESIS);
    expect(res.verified).toBe(true);
    expect(res.checkedCount).toBe(4);
  });
});

describe('verifyChainRows (pure) — corruption', () => {
  it('missing first sequence', () => {
    const res = verifyChainRows([row(2n, GENESIS_PREV_HASH)], GENESIS);
    expect(res.firstError!.kind).toBe('missing_sequence');
  });
  it('middle sequence gap', () => {
    const chain = validChain(3);
    const res = verifyChainRows([chain[0], chain[2]], GENESIS); // 1 then 3
    expect(res.firstError!.kind).toBe('missing_sequence');
    expect(res.firstError!.actual).toBe('3');
  });
  it('duplicate sequence', () => {
    const chain = validChain(1);
    const res = verifyChainRows([chain[0], chain[0]], GENESIS);
    expect(res.firstError!.kind).toBe('duplicate_sequence');
  });
  it('incorrect genesis prevHash', () => {
    const res = verifyChainRows([row(1n, 'a'.repeat(64))], GENESIS);
    expect(res.firstError!.kind).toBe('prev_hash_mismatch');
  });
  it('later prevHash mismatch', () => {
    const first = row(1n, GENESIS_PREV_HASH);
    const second = row(2n, 'b'.repeat(64)); // wrong link
    const res = verifyChainRows([first, second], GENESIS);
    expect(res.firstError!.kind).toBe('prev_hash_mismatch');
    expect(res.firstError!.sequence).toBe('2');
  });
  it('tampered stored selfHash (well-formed but wrong)', () => {
    const r = row(1n, GENESIS_PREV_HASH);
    const res = verifyChainRows([{ ...r, selfHash: 'c'.repeat(64) }], GENESIS);
    expect(res.firstError!.kind).toBe('self_hash_mismatch');
  });
  it('tampered hash-participating field (selfHash no longer matches)', () => {
    const r = row(1n, GENESIS_PREV_HASH);
    const res = verifyChainRows([{ ...r, actorId: 'tampered' }], GENESIS);
    expect(res.firstError!.kind).toBe('self_hash_mismatch');
  });
  it('invalid selfHash format', () => {
    const r = row(1n, GENESIS_PREV_HASH);
    const res = verifyChainRows([{ ...r, selfHash: 'NOT-HEX' }], GENESIS);
    expect(res.firstError!.kind).toBe('invalid_hash_format');
  });
  it('unsupported hashAlgorithm', () => {
    const res = verifyChainRows([row(1n, GENESIS_PREV_HASH, { hashAlgorithm: 'sha256/v2' })], GENESIS);
    expect(res.firstError!.kind).toBe('invalid_algorithm');
  });
  it('incomplete integrity (NULL field)', () => {
    const r = row(1n, GENESIS_PREV_HASH);
    const res = verifyChainRows([{ ...r, selfHash: null }], GENESIS);
    expect(res.firstError!.kind).toBe('incomplete_integrity');
  });
  it('fails fast at the FIRST error', () => {
    const chain = validChain(3);
    // corrupt seq 2 and seq 3; expect the seq-2 error only
    const res = verifyChainRows(
      [chain[0], { ...chain[1], actorId: 'x' }, { ...chain[2], selfHash: 'z'.repeat(64) }],
      GENESIS,
    );
    expect(res.firstError!.sequence).toBe('2');
    expect(res.checkedCount).toBe(1);
  });
});

describe('verifyChainRows (pure) — bounded anchor start', () => {
  it('verifies a slice starting from a trusted anchor prevHash', () => {
    const chain = validChain(3);
    const res = verifyChainRows([chain[1], chain[2]], { sequence: 2n, prevHash: chain[0].selfHash! });
    expect(res.verified).toBe(true);
    expect(res.checkedCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// DB integration: real chains via persistence.append; anchor/legacy/no-writes.
// ---------------------------------------------------------------------------

const prisma = createTestPrisma();
const chain = new AuditChainService();
const persistence = new AuditPersistenceService(prisma as unknown as PrismaService, chain);
const verifier = new AuditVerificationService(prisma as unknown as PrismaService);

const MARKER = 'p2-4d-verify-it';
const LAB_CHAINS = 'lab:vf-';

function mkInput(scope: 'LAB' | 'SYSTEM' | 'CROSS_LAB', labId?: string): AuditRecordInput {
  return {
    category: 'RECORD_LIFECYCLE',
    action: { code: 'RECORD_CREATED' },
    actor: { type: scope === 'SYSTEM' ? 'SYSTEM' : 'STAFF' },
    organization: scope === 'LAB' ? { scope, labId } : { scope },
    resource: { type: 'Record', id: 'r' },
    outcome: { status: 'SUCCESS' },
    producerModule: MARKER,
  };
}
const appendTx = (i: AuditRecordInput) => prisma.$transaction((tx) => persistence.append(i, tx as any));

async function cleanup() {
  await prisma.auditEvent.deleteMany({ where: { producerModule: MARKER } });
  await prisma.$executeRaw`DELETE FROM "AuditChainHead" WHERE "chainId" LIKE ${LAB_CHAINS + '%'}`;
  // P2-R016A — this spec exercises the shared SYSTEM and CROSS_LAB chains; reset them via the guarded
  // helper (isolated test DB only), replacing the former `… IN ('system','cross-lab')` head delete
  // that caused R-016.
  await resetIsolatedChain(prisma, 'system', 'cross-lab');
}
beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('AuditVerificationService.verifyChain (real DB)', () => {
  it('verifies a valid LAB chain', async () => {
    await appendTx(mkInput('LAB', 'vf-lab'));
    await appendTx(mkInput('LAB', 'vf-lab'));
    const res = await verifier.verifyChain({ chainId: 'lab:vf-lab' });
    expect(res.verified).toBe(true);
    expect(res.checkedCount).toBe(2);
    expect(res.firstError).toBeUndefined();
  });

  it('verifies a SYSTEM chain and a CROSS_LAB chain', async () => {
    await appendTx(mkInput('SYSTEM'));
    await appendTx(mkInput('CROSS_LAB'));
    expect((await verifier.verifyChain({ chainId: 'system' })).verified).toBe(true);
    expect((await verifier.verifyChain({ chainId: 'cross-lab' })).verified).toBe(true);
  });

  it('bounded range from sequence 1 verifies via the genesis rule', async () => {
    const res = await verifier.verifyChain({ chainId: 'lab:vf-lab', fromSequence: 1n, toSequence: 1n });
    expect(res.verified).toBe(true);
    expect(res.checkedCount).toBe(1);
  });

  it('bounded range from sequence >1 verifies using the trusted anchor', async () => {
    const res = await verifier.verifyChain({ chainId: 'lab:vf-lab', fromSequence: 2n });
    expect(res.verified).toBe(true);
    expect(res.checkedCount).toBe(1);
  });

  it('empty chain → empty_chain', async () => {
    const res = await verifier.verifyChain({ chainId: 'lab:vf-nope' });
    expect(res.verified).toBe(false);
    expect(res.firstError!.kind).toBe('empty_chain');
  });

  it('invalid range → invalid_range', async () => {
    const res = await verifier.verifyChain({ chainId: 'lab:vf-lab', fromSequence: 5n, toSequence: 2n });
    expect(res.firstError!.kind).toBe('invalid_range');
  });

  it('bounded range whose anchor is missing → anchor_unavailable', async () => {
    // Controlled fixture: a lone chained row at sequence 5 (no seq 4 anchor). Uses a raw create,
    // not the chain service; the production UNIQUE(chainId,sequence) is untouched.
    await prisma.auditEvent.create({
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
        scopeLabId: 'vf-anchor',
        resourceType: 'Record',
        actionCode: 'RECORD_CREATED',
        outcome: 'SUCCESS',
        producerModule: MARKER,
        chainId: 'lab:vf-anchor',
        sequence: 5n,
        prevHash: 'a'.repeat(64),
        selfHash: 'b'.repeat(64),
        hashAlgorithm: AUDIT_HASH_ALGORITHM,
      },
    });
    const res = await verifier.verifyChain({ chainId: 'lab:vf-anchor', fromSequence: 5n });
    expect(res.firstError!.kind).toBe('anchor_unavailable');
  });

  it('legacy NULL-integrity rows are ignored (not corruption) and never included in a chain', async () => {
    // A legacy row: NULL chainId + NULL integrity. It must not appear in any chain verification.
    await prisma.auditEvent.create({
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
        scopeLabId: 'vf-lab',
        resourceType: 'Record',
        actionCode: 'RECORD_CREATED',
        outcome: 'SUCCESS',
        producerModule: MARKER,
        // chainId/sequence/hashes all left NULL (legacy)
      },
    });
    const res = await verifier.verifyChain({ chainId: 'lab:vf-lab' });
    expect(res.verified).toBe(true); // the legacy row (NULL chainId) is not part of lab:vf-lab
  });

  it('performs NO writes during verification', async () => {
    const eventsBefore = await prisma.auditEvent.count();
    const headsBefore = await prisma.auditChainHead.count();
    await verifier.verifyChain({ chainId: 'lab:vf-lab' });
    await verifier.verifyChain({ chainId: 'system' });
    expect(await prisma.auditEvent.count()).toBe(eventsBefore);
    expect(await prisma.auditChainHead.count()).toBe(headsBefore);
  });
});
