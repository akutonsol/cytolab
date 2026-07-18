import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ExecutionContextService } from '../../common/execution-context/execution-context.service';
import { AuditPersistenceService } from './audit-persistence.service';
import { AuditChainService } from './audit-chain.service';
import { AuditVerificationService } from './audit-verification.service';
import { PhiAccessDedup } from './phi-access-dedup';
import { AuditRecorder } from './audit-recorder.service';

/**
 * Program 2 · P2-5C — end-to-end PHI-read capture against the local DB via the REAL recorder path
 * (recordPhiRead → dedup → record → chained append). Proves the event, its bounded metadata, the
 * owner-derived patientRef, request-scoped dedup, chain integrity (P2-4D verifier), and concurrency.
 */
const prisma = new PrismaClient();
const chain = new AuditChainService();
const persistence = new AuditPersistenceService(prisma as unknown as PrismaService, chain);
const labContext = new LabContext();
const execCtx = new ExecutionContextService(labContext);
const dedup = new PhiAccessDedup(execCtx);
const recorder = new AuditRecorder(persistence, execCtx, prisma as unknown as PrismaService, dedup);
const verifier = new AuditVerificationService(prisma as unknown as PrismaService);

const LAB_ID = 'it-phi-p25c';
const LAB_CHAIN = `lab:${LAB_ID}`;
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function cleanup() {
  // recordPhiRead stamps the owner module (e.g. 'records'), so clean by this unique test lab chain.
  await prisma.auditEvent.deleteMany({ where: { chainId: LAB_CHAIN } });
  await prisma.$executeRaw`DELETE FROM "AuditChainHead" WHERE "chainId" = ${LAB_CHAIN}`;
}
beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/** Run a callback inside a lab-scoped authenticated HTTP execution (one request). */
async function inRequest(fn: () => Promise<void>) {
  await labContext.runScoped({ labId: LAB_ID }, async () => {
    execCtx.initHttpRequest({ method: 'GET', ip: '203.0.113.9', socket: { remoteAddress: '203.0.113.9' }, headers: { 'user-agent': 'jest' } } as any);
    execCtx.bindPrincipal({ kind: 'staff', userId: 'u-phi', labId: LAB_ID, sessionId: 's-phi' });
    await fn();
  });
}

describe('P2-5C PHI-read capture (real DB)', () => {
  it('emits a chained PATIENT_RECORD_VIEWED with owner-derived patientRef and bounded metadata', async () => {
    await inRequest(async () => {
      await recorder.recordPhiRead({
        patientId: UUID(1),
        accessSurface: 'record_detail',
        accessMode: 'view',
        producerModule: 'records',
        resource: { type: 'Record', id: 'rec-1' },
      });
    });
    const ev = await prisma.auditEvent.findFirst({ where: { chainId: LAB_CHAIN, actionCode: 'PATIENT_RECORD_VIEWED', patientRef: UUID(1) } });
    expect(ev).toBeTruthy();
    expect(ev!.category).toBe('PHI_ACCESS');
    expect(ev!.phiIndicator).toBe(true);
    expect(ev!.dataClass).toBe('PHI');
    expect(ev!.durabilityClass).toBe('OPERATIONAL');
    expect(ev!.patientRef).toBe(UUID(1)); // internal UUID only — no name/DOB/MRN
    expect(ev!.metadata).toEqual({ accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records' });
    // chained
    expect(ev!.sequence).not.toBeNull();
    expect(ev!.selfHash).toMatch(/^[a-f0-9]{64}$/);
    // no raw PHI anywhere in the stored row's stringified metadata
    expect(JSON.stringify(ev!.metadata)).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+|\d{4}-\d{2}-\d{2}/);
  });

  it('dedupes same patient+surface within one request; distinct surfaces/patients emit separately', async () => {
    const before = await prisma.auditEvent.count({ where: { chainId: LAB_CHAIN } });
    await inRequest(async () => {
      await recorder.recordPhiRead({ patientId: UUID(2), accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records', resource: { type: 'Record', id: 'r' } });
      await recorder.recordPhiRead({ patientId: UUID(2), accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records', resource: { type: 'Record', id: 'r' } }); // dup
      await recorder.recordPhiRead({ patientId: UUID(2), accessSurface: 'slide', accessMode: 'view', producerModule: 'wsi', resource: { type: 'DigitalSlide', id: 's' } }); // diff surface
    });
    const after = await prisma.auditEvent.count({ where: { chainId: LAB_CHAIN } });
    expect(after - before).toBe(2); // record_detail once + slide once
  });

  it('a new request re-emits for the same patient+surface', async () => {
    const before = await prisma.auditEvent.count({ where: { chainId: LAB_CHAIN, patientRef: UUID(3) } });
    await inRequest(() => recorder.recordPhiRead({ patientId: UUID(3), accessSurface: 'patient_detail', accessMode: 'view', producerModule: 'patients', resource: { type: 'Patient', id: UUID(3) } }));
    await inRequest(() => recorder.recordPhiRead({ patientId: UUID(3), accessSurface: 'patient_detail', accessMode: 'view', producerModule: 'patients', resource: { type: 'Patient', id: UUID(3) } }));
    const after = await prisma.auditEvent.count({ where: { chainId: LAB_CHAIN, patientRef: UUID(3) } });
    expect(after - before).toBe(2);
  });

  it('concurrent reads of DIFFERENT patients allocate a gapless, valid chain', async () => {
    // Each read runs in its own request scope (own dedup set); the per-lab chain-head serializes them.
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        inRequest(() =>
          recorder.recordPhiRead({ patientId: UUID(100 + i), accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records', resource: { type: 'Record', id: `c${i}` } }),
        ),
      ),
    );
    const res = await verifier.verifyChain({ chainId: LAB_CHAIN });
    expect(res.verified).toBe(true);
    expect(res.firstError).toBeUndefined();
  });

  it('the whole lab chain verifies (PHI events preserve chain integrity)', async () => {
    const res = await verifier.verifyChain({ chainId: LAB_CHAIN });
    expect(res.verified).toBe(true);
    expect(res.checkedCount).toBeGreaterThan(0);
  });
});
