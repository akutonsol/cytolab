import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { LabContext } from '../../../common/tenancy/lab-context';
import { ExecutionContextService } from '../../../common/execution-context/execution-context.service';
import { AuditPersistenceService } from '../audit-persistence.service';
import { AuditChainService } from '../audit-chain.service';
import { PhiAccessDedup } from '../phi-access-dedup';
import { AuditRecorder } from '../audit-recorder.service';
import { AuditQueryService } from './audit-query.service';
import { AuditQueryReadCaptureGuard } from './audit-query-read-capture.guard';
import { AUDIT_READ, AUDIT_PHI_READ } from './audit-query.permissions';

/**
 * Program 2 · P2-7C — real-ledger capture, LAB scope only. LAB capture lands on the reader's own
 * `lab:<id>` chain, which this test fully owns and cleans; SYSTEM/CROSS_LAB envelope behavior is
 * unit-verified (audit-query.capture.spec) to avoid appending to — and being unable to clean — the
 * shared `system` chain (the accepted P2-4 isolation debt). Capture goes through the REAL recorder /
 * append / chain path.
 */
const prisma = new PrismaClient();
const chain = new AuditChainService();
const persistence = new AuditPersistenceService(prisma as unknown as PrismaService, chain);
const labContext = new LabContext();
const execCtx = new ExecutionContextService(labContext);
const recorder = new AuditRecorder(persistence, execCtx, prisma as unknown as PrismaService, new PhiAccessDedup(execCtx));
const service = new AuditQueryService(prisma as unknown as PrismaService, recorder, execCtx, new AuditQueryReadCaptureGuard());

const FIX = 'p27c-cap-fix';
const LAB1 = 'p27c-cap-lab1';
const LAB_CHAIN = `lab:${LAB1}`;
const win = new Date('2026-05-01T12:00:00Z');
const ids: Record<string, string> = {};

const fakeReq = () => ({ method: 'GET', ip: '203.0.113.5', socket: { remoteAddress: '203.0.113.5' }, headers: { 'user-agent': 'jest' } }) as any;
function asLab1<T>(fn: () => Promise<T>): Promise<T> {
  return labContext.runScoped({ labId: LAB1 }, async () => {
    execCtx.initHttpRequest(fakeReq());
    execCtx.bindPrincipal({ kind: 'staff', userId: 'p27c-admin', labId: LAB1, sessionId: 'sess' } as any);
    return fn();
  });
}
const FILTERS = { correlationId: FIX, timeFrom: new Date(win.getTime() - 600000), timeTo: new Date(win.getTime() + 600000) };
const LAB_PHI = { labId: LAB1, permissions: [AUDIT_READ, AUDIT_PHI_READ] } as any;
const LAB_BASE = { labId: LAB1, permissions: [AUDIT_READ] } as any;

const captures = () =>
  prisma.auditEvent.findMany({
    where: { producerModule: 'audit-query', scopeLabId: LAB1, actionCode: 'AUDIT_EVENT_PHI_ACCESSED' },
    orderBy: { recordedAt: 'asc' },
  });

async function cleanCaptures() {
  await prisma.auditEvent.deleteMany({ where: { producerModule: 'audit-query', scopeLabId: LAB1 } });
}
async function cleanAll() {
  await cleanCaptures();
  await prisma.auditEvent.deleteMany({ where: { producerModule: FIX } });
  await prisma.$executeRaw`DELETE FROM "AuditChainHead" WHERE "chainId" = ${LAB_CHAIN}`;
}

beforeAll(async () => {
  await cleanAll();
  const mk = async (key: string, i: number) => {
    const r = await prisma.auditEvent.create({
      data: {
        occurredAt: win, recordedAt: new Date(win.getTime() + i * 1000), eventVersion: 1, category: 'CONFIGURATION',
        severity: 'WARNING', phiIndicator: false, dataClass: 'INTERNAL', retentionClass: 'EXTENDED', durabilityClass: 'OPERATIONAL',
        actorType: 'STAFF', organizationScope: 'LAB', scopeLabId: LAB1, resourceType: 'Lab', actionCode: 'SETTING_CHANGED',
        outcome: 'SUCCESS', producerModule: FIX, correlationId: FIX,
      },
      select: { id: true },
    });
    ids[key] = r.id;
  };
  await mk('a', 1);
  await mk('b', 2);
});
beforeEach(cleanCaptures);
afterAll(async () => {
  await cleanAll();
  await prisma.$disconnect();
});

describe('AuditQueryService (real DB) — P2-7C LAB PHI capture', () => {
  it('a PHI list appends exactly ONE LAB-scoped, actor-attributed capture; base list appends none', async () => {
    await asLab1(() => service.list({ principal: LAB_BASE, filters: FILTERS })); // base → no capture
    expect(await captures()).toHaveLength(0);

    await asLab1(() => service.list({ principal: LAB_PHI, filters: FILTERS, phi: true }));
    const caps = await captures();
    expect(caps).toHaveLength(1);
    const cap = caps[0];
    expect(cap.category).toBe('SECURITY');
    expect(cap.organizationScope).toBe('LAB');
    expect(cap.scopeLabId).toBe(LAB1);
    expect(cap.actorId).toBe('p27c-admin');
    expect(cap.phiIndicator).toBe(false);
    expect(cap.selfHash).toMatch(/^[a-f0-9]{64}$/); // real append + chain
    expect(cap.metadata).toMatchObject({ accessMode: 'list', queryScope: 'LAB', resultCount: 2 });
    // No PHI / raw values in the capture metadata.
    expect(JSON.stringify(cap.metadata)).not.toMatch(/patientRef|PSEUDO|203\.0\.113\.5|company_profile/);
  });

  it('a zero-result PHI list still appends one capture with resultCount 0', async () => {
    await asLab1(() => service.list({ principal: LAB_PHI, filters: { ...FILTERS, actorId: 'nobody' }, phi: true }));
    const caps = await captures();
    expect(caps).toHaveLength(1);
    expect(caps[0].metadata).toMatchObject({ resultCount: 0 });
  });

  it('a PHI detail appends one capture referencing the accessed AuditEvent; base detail appends none', async () => {
    await asLab1(() => service.getById({ principal: LAB_BASE, id: ids.a }));
    expect(await captures()).toHaveLength(0);

    await asLab1(() => service.getById({ principal: LAB_PHI, id: ids.a, phi: true }));
    const caps = await captures();
    expect(caps).toHaveLength(1);
    expect(caps[0].resourceType).toBe('AuditEvent');
    expect(caps[0].resourceId).toBe(ids.a);
    expect(caps[0].metadata).toMatchObject({ accessMode: 'detail', queryScope: 'LAB', resultCount: 1 });
  });
});
