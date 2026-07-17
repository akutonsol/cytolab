import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ExecutionContextService } from '../../common/execution-context/execution-context.service';
import { AuditPersistenceService } from './audit-persistence.service';
import { AuditRecorder } from './audit-recorder.service';

/**
 * Program 2 · P2-3 — end-to-end: the REAL recorder → REAL persistence → AuditEvent row, against
 * the local DB. Proves rows are created correctly and that integrity + sequence remain NULL in
 * P2-3 (activated only in P2-4).
 */
const prisma = new PrismaClient();
const persistence = new AuditPersistenceService(prisma as unknown as PrismaService);
const labContext = new LabContext();
const execCtx = new ExecutionContextService(labContext);
const recorder = new AuditRecorder(persistence, execCtx);

const MARKER = 'p2-3-recorder-it';

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { producerModule: MARKER } });
  await prisma.$disconnect();
});

describe('AuditRecorder → AuditEvent (real DB)', () => {
  it('creates a lab-scoped HTTP event with resolved classification and NULL integrity/sequence', async () => {
    await labContext.runScoped({ labId: 'lab-it-1' }, async () => {
      execCtx.initHttpRequest({
        method: 'POST',
        ip: '203.0.113.5',
        socket: { remoteAddress: '203.0.113.5' },
        headers: { 'user-agent': 'jest' },
      } as any);
      execCtx.bindPrincipal({ kind: 'staff', userId: 'u-it-1', labId: 'lab-it-1', sessionId: 's-it-1' });
      await recorder.record({
        category: 'RECORD_LIFECYCLE',
        actionCode: 'RECORD_CREATED',
        resource: { type: 'Record', id: 'rec-it-1' },
        outcome: { status: 'SUCCESS' },
        producerModule: MARKER,
      });
    });

    const row = await prisma.auditEvent.findFirst({
      where: { producerModule: MARKER, actionCode: 'RECORD_CREATED' },
    });
    expect(row).toBeTruthy();
    // Registry-resolved classification (producer never set these).
    expect(row!.category).toBe('RECORD_LIFECYCLE');
    expect(row!.eventVersion).toBe(1);
    expect(row!.severity).toBe('NOTICE');
    expect(row!.dataClass).toBe('CONFIDENTIAL');
    expect(row!.durabilityClass).toBe('OPERATIONAL'); // P2-3R: best-effort, not falsely durable
    // Attribution from the ExecutionContext.
    expect(row!.actorType).toBe('STAFF');
    expect(row!.actorId).toBe('u-it-1');
    expect(row!.organizationScope).toBe('LAB');
    expect(row!.scopeLabId).toBe('lab-it-1');
    expect(row!.correlationId).toBeTruthy();
    // Integrity + sequence remain INACTIVE in P2-3.
    expect(row!.sequence).toBeNull();
    expect(row!.selfHash).toBeNull();
    expect(row!.prevHash).toBeNull();
    expect(row!.chainId).toBeNull();
  });

  it('creates a SYSTEM job event with SYSTEM actor and no scopeLabId', async () => {
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
    expect(row).toBeTruthy();
    expect(row!.actorType).toBe('SYSTEM');
    expect(row!.organizationScope).toBe('SYSTEM');
    expect(row!.scopeLabId).toBeNull();
    expect(row!.sequence).toBeNull();
  });
});
