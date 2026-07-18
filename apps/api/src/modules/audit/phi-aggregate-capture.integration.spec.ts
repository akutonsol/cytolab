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
 * Program 2 · P2-5D — aggregate PHI capture against the local DB: PATIENT_LIST_QUERIED / PHI_EXPORTED
 * emit correctly (patientRef null, bounded metadata), append to the lab chain, coexist with P2-5C
 * single-subject events, and keep the chain valid. Includes a bounded contention benchmark.
 */
const prisma = new PrismaClient();
const chain = new AuditChainService();
const persistence = new AuditPersistenceService(prisma as unknown as PrismaService, chain);
const labContext = new LabContext();
const execCtx = new ExecutionContextService(labContext);
const dedup = new PhiAccessDedup(execCtx);
const recorder = new AuditRecorder(persistence, execCtx, prisma as unknown as PrismaService, dedup);
const verifier = new AuditVerificationService(prisma as unknown as PrismaService);

const LAB_ID = 'it-phi-agg-p25d';
const LAB_CHAIN = `lab:${LAB_ID}`;
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function cleanup() {
  await prisma.auditEvent.deleteMany({ where: { chainId: LAB_CHAIN } });
  await prisma.$executeRaw`DELETE FROM "AuditChainHead" WHERE "chainId" = ${LAB_CHAIN}`;
}
beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function inRequest(fn: () => Promise<void>) {
  await labContext.runScoped({ labId: LAB_ID }, async () => {
    execCtx.initHttpRequest({ method: 'GET', ip: '203.0.113.9', socket: { remoteAddress: '203.0.113.9' }, headers: { 'user-agent': 'jest' } } as any);
    execCtx.bindPrincipal({ kind: 'staff', userId: 'u-agg', labId: LAB_ID, sessionId: 's-agg' });
    await fn();
  });
}

describe('P2-5D aggregate PHI capture (real DB)', () => {
  it('PATIENT_LIST_QUERIED: chained, patientRef null, bounded metadata', async () => {
    await inRequest(() => recorder.recordPhiList({ accessSurface: 'list', producerModule: 'records', resultCount: 15, pageSize: 20, resourceType: 'RecordList' }));
    const ev = await prisma.auditEvent.findFirst({ where: { chainId: LAB_CHAIN, actionCode: 'PATIENT_LIST_QUERIED' } });
    expect(ev).toBeTruthy();
    expect(ev!.patientRef).toBeNull();
    expect(ev!.phiIndicator).toBe(true);
    expect(ev!.durabilityClass).toBe('OPERATIONAL');
    expect(ev!.metadata).toEqual({ accessSurface: 'list', accessMode: 'view', producerModule: 'records', resultCount: 15, pageSize: 20 });
    expect(ev!.selfHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('PHI_EXPORTED: chained export event with documentType, no filename/URL/PHI', async () => {
    await inRequest(() => recorder.recordPhiExport({ accessSurface: 'export', producerModule: 'coding', documentType: 'coding', resultCount: 30, filterClass: 'date_range', resourceType: 'CodingExport' }));
    const ev = await prisma.auditEvent.findFirst({ where: { chainId: LAB_CHAIN, actionCode: 'PHI_EXPORTED' } });
    expect(ev).toBeTruthy();
    expect(ev!.patientRef).toBeNull();
    expect(ev!.metadata).toEqual({ accessSurface: 'export', accessMode: 'export', producerModule: 'coding', documentType: 'coding', resultCount: 30, filterClass: 'date_range' });
    expect(JSON.stringify(ev!.metadata)).not.toMatch(/\.csv|\.pdf|https?:|[A-Z][a-z]+ [A-Z][a-z]+/);
  });

  it('mixed single-subject + list + export events keep a contiguous, valid chain', async () => {
    await inRequest(async () => {
      await recorder.recordPhiRead({ patientId: UUID(1), accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records', resource: { type: 'Record', id: 'r1' } });
      await recorder.recordPhiList({ accessSurface: 'search', producerModule: 'search', resultCount: 4, filterClass: 'text', resourceType: 'SearchResults' });
      await recorder.recordPhiExport({ accessSurface: 'export', producerModule: 'reports', documentType: 'report', resultCount: 2, resourceType: 'ReportBatch' });
    });
    const res = await verifier.verifyChain({ chainId: LAB_CHAIN });
    expect(res.verified).toBe(true);
    expect(res.firstError).toBeUndefined();
  });

  it('CONTENTION BENCHMARK: concurrent aggregate reads in one lab stay gapless and valid', async () => {
    const CONCURRENCY = 24;
    const started = Date.now();
    await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        inRequest(() =>
          recorder.recordPhiList({ accessSurface: 'list', producerModule: 'patients', resultCount: 10 + i, pageSize: 20, resourceType: 'PatientList' }),
        ),
      ),
    );
    const elapsedMs = Date.now() - started;
    const res = await verifier.verifyChain({ chainId: LAB_CHAIN });
    // eslint-disable-next-line no-console
    console.log(`[P2-5D contention] concurrency=${CONCURRENCY} events=${res.checkedCount} elapsedMs=${elapsedMs} perEventMs≈${(elapsedMs / CONCURRENCY).toFixed(1)} verified=${res.verified}`);
    expect(res.verified).toBe(true); // per-lab chain-head FOR UPDATE serialized them without gaps
    expect(res.firstError).toBeUndefined();
    expect(elapsedMs).toBeLessThan(30_000); // no lock timeout/deadlock at pilot concurrency
  });
});
