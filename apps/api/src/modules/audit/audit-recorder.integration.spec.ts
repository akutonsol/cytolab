import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ExecutionContextService } from '../../common/execution-context/execution-context.service';
import { AuditPersistenceService } from './audit-persistence.service';
import { AuditChainService } from './audit-chain.service';
import { AuditRecorder } from './audit-recorder.service';
import { computeSelfHash, AuditCanonicalFields } from './audit-hash';
import { GENESIS_PREV_HASH } from './audit-chain';

/**
 * Program 2 · P2-4C — end-to-end: the REAL recorder (OPERATIONAL → recorder-owned tx) → REAL
 * persistence → chained AuditEvent row, against the local DB. Proves integrity fields are now
 * POPULATED and that the stored selfHash equals a recomputation via the shared P2-4B helper.
 */
const prisma = new PrismaClient();
const chain = new AuditChainService();
const persistence = new AuditPersistenceService(prisma as unknown as PrismaService, chain);
const labContext = new LabContext();
const execCtx = new ExecutionContextService(labContext);
const recorder = new AuditRecorder(persistence, execCtx, prisma as unknown as PrismaService);

const MARKER = 'p2-4c-recorder-it';
const LAB_ID = 'it-rec-p24c';
const LAB_CHAIN = `lab:${LAB_ID}`;

async function cleanup() {
  await prisma.auditEvent.deleteMany({ where: { producerModule: MARKER } });
  await prisma.$executeRaw`DELETE FROM "AuditChainHead" WHERE "chainId" = ${LAB_CHAIN}`;
}
beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/** Map a stored AuditEvent row to the shared canonical fields, for recomputation. */
function toCanonical(row: any): AuditCanonicalFields {
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    recordedAt: row.recordedAt,
    schemaVersion: row.schemaVersion,
    eventVersion: row.eventVersion,
    category: row.category,
    actionCode: row.actionCode,
    detailCode: row.detailCode,
    severity: row.severity,
    phiIndicator: row.phiIndicator,
    dataClass: row.dataClass,
    retentionClass: row.retentionClass,
    durabilityClass: row.durabilityClass,
    actorType: row.actorType,
    actorId: row.actorId,
    onBehalfOfActorId: row.onBehalfOfActorId,
    servicePrincipal: row.servicePrincipal,
    organizationScope: row.organizationScope,
    scopeLabId: row.scopeLabId,
    organizationId: row.organizationId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    resourceLabId: row.resourceLabId,
    parentResourceType: row.parentResourceType,
    parentResourceId: row.parentResourceId,
    patientRef: row.patientRef,
    outcome: row.outcome,
    statusCode: row.statusCode,
    errorCode: row.errorCode,
    reasonCode: row.reasonCode,
    changedFields: row.changedFields,
    beforeHash: row.beforeHash,
    afterHash: row.afterHash,
    producerModule: row.producerModule,
    executionId: row.executionId,
    hashAlgorithm: row.hashAlgorithm,
    metadata: row.metadata,
    sequence: row.sequence,
    chainId: row.chainId,
    prevHash: row.prevHash,
  };
}

async function recordLab() {
  await labContext.runScoped({ labId: LAB_ID }, async () => {
    execCtx.initHttpRequest({
      method: 'POST',
      ip: '203.0.113.5',
      socket: { remoteAddress: '203.0.113.5' },
      headers: { 'user-agent': 'jest' },
    } as any);
    execCtx.bindPrincipal({ kind: 'staff', userId: 'u-it-1', labId: LAB_ID, sessionId: 's-it-1' });
    await recorder.record({
      category: 'RECORD_LIFECYCLE',
      actionCode: 'RECORD_CREATED',
      resource: { type: 'Record', id: 'rec-it-1' },
      outcome: { status: 'SUCCESS' },
      producerModule: MARKER,
    });
  });
}

describe('AuditRecorder → chained AuditEvent (real DB, P2-4C)', () => {
  it('genesis: populated integrity, sequence 1, zero prevHash, advanced head', async () => {
    await recordLab();
    const row = await prisma.auditEvent.findFirst({
      where: { producerModule: MARKER, chainId: LAB_CHAIN },
      orderBy: { sequence: 'asc' },
    });
    expect(row).toBeTruthy();
    // classification + attribution (unchanged from P2-3)
    expect(row!.category).toBe('RECORD_LIFECYCLE');
    expect(row!.durabilityClass).toBe('OPERATIONAL');
    expect(row!.actorType).toBe('STAFF');
    expect(row!.scopeLabId).toBe(LAB_ID);
    // integrity is now ACTIVE
    expect(row!.chainId).toBe(LAB_CHAIN);
    expect(row!.sequence).toBe(1n);
    expect(row!.prevHash).toBe(GENESIS_PREV_HASH);
    expect(row!.selfHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row!.hashAlgorithm).toBe('sha256/v1');

    const head = await prisma.auditChainHead.findUnique({ where: { chainId: LAB_CHAIN } });
    expect(head!.lastSequence).toBe(1n);
    expect(head!.lastSelfHash).toBe(row!.selfHash);
  });

  it('stored selfHash equals a recomputation via the shared canonical helper', async () => {
    const row = await prisma.auditEvent.findFirst({
      where: { producerModule: MARKER, chainId: LAB_CHAIN },
      orderBy: { sequence: 'asc' },
    });
    expect(computeSelfHash(toCanonical(row))).toBe(row!.selfHash);
  });

  it('second event links to the first and advances the sequence', async () => {
    const first = await prisma.auditEvent.findFirst({
      where: { producerModule: MARKER, chainId: LAB_CHAIN },
      orderBy: { sequence: 'asc' },
    });
    await recordLab();
    const second = await prisma.auditEvent.findFirst({
      where: { producerModule: MARKER, chainId: LAB_CHAIN, sequence: 2n },
    });
    expect(second).toBeTruthy();
    expect(second!.prevHash).toBe(first!.selfHash);
    expect(computeSelfHash(toCanonical(second))).toBe(second!.selfHash);
  });

  it('SYSTEM job event is chained on the system chain with no scopeLabId', async () => {
    await execCtx.runJob({ jobName: 'tat.sla-scan' }, async () => {
      await recorder.record({
        category: 'SYSTEM',
        actionCode: 'JOB_COMPLETED',
        resource: { type: 'Job', id: 'tat.sla-scan' },
        outcome: { status: 'SUCCESS' },
        producerModule: MARKER,
      });
    });
    const row = await prisma.auditEvent.findFirst({
      where: { producerModule: MARKER, actionCode: 'JOB_COMPLETED' },
    });
    expect(row!.organizationScope).toBe('SYSTEM');
    expect(row!.scopeLabId).toBeNull();
    expect(row!.chainId).toBe('system');
    expect(row!.sequence).not.toBeNull();
    expect(row!.selfHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
