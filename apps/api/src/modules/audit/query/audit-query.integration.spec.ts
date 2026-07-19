import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditQueryService } from './audit-query.service';
import { AuditQueryReadCaptureGuard } from './audit-query-read-capture.guard';
import { AUDIT_READ, AUDIT_SYSTEM_READ, AUDIT_PHI_READ } from './audit-query.permissions';

/**
 * Program 2 · P2-7B — real-DB integration for the governed query reader. Fixtures are inserted
 * owner-locally in the test (NOT via the production append path — query tests need controlled scope/
 * lab/patientRef shapes and do not exercise the chain) and are isolated by a unique correlationId
 * marker + a bounded time window, so results never collide with other rows in the shared dev DB.
 * The accepted P2-4 SYSTEM-chain isolation debt is untouched.
 */
const prisma = new PrismaClient();
// P2-7B integration keeps capture as a no-op stub (P2-7C capture has its own integration spec).
const stubRecorder = { recordAuditEventPhiAccessed: async () => undefined } as any;
const stubExecCtx = { runSystemAsCurrentActor: (fn: any) => fn() } as any;
const service = new AuditQueryService(prisma as unknown as PrismaService, stubRecorder, stubExecCtx, new AuditQueryReadCaptureGuard());

const MARKER = 'p27b-query-it';
const LAB1 = 'p27b-lab1';
const LAB2 = 'p27b-lab2';
const base = new Date('2026-06-01T12:00:00Z'); // fixed window, well inside no default range → always pass explicit timeFrom/timeTo
const at = (min: number) => new Date(base.getTime() + min * 60000);

const ids: Record<string, string> = {};

async function mk(key: string, over: any): Promise<void> {
  const row = await prisma.auditEvent.create({
    data: {
      occurredAt: over.recordedAt ?? base,
      recordedAt: over.recordedAt ?? base,
      eventVersion: 1,
      category: 'CONFIGURATION',
      severity: 'WARNING',
      phiIndicator: false,
      dataClass: 'INTERNAL',
      retentionClass: 'EXTENDED',
      durabilityClass: 'OPERATIONAL',
      actorType: 'STAFF',
      organizationScope: 'LAB',
      resourceType: 'Lab',
      actionCode: 'SETTING_CHANGED',
      outcome: 'SUCCESS',
      producerModule: MARKER,
      correlationId: MARKER,
      ...over,
    },
    select: { id: true },
  });
  ids[key] = row.id;
}

const FILTERS = { correlationId: MARKER, timeFrom: at(-10), timeTo: at(60) };
const P = (over: any) => ({ permissions: [], ...over });

beforeAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { producerModule: MARKER } });
  await mk('lab1a', { scopeLabId: LAB1, recordedAt: at(1) });
  await mk('lab1b', { scopeLabId: LAB1, recordedAt: at(2) });
  await mk('lab2', { scopeLabId: LAB2, recordedAt: at(3) });
  await mk('system', { organizationScope: 'SYSTEM', scopeLabId: null, recordedAt: at(4) });
  await mk('crosslab', { organizationScope: 'CROSS_LAB', scopeLabId: null, recordedAt: at(5) });
  await mk('unknownver', { scopeLabId: LAB1, eventVersion: 999, recordedAt: at(6) });
  await mk('phi', {
    scopeLabId: LAB1,
    category: 'PHI_ACCESS',
    actionCode: 'PATIENT_RECORD_VIEWED',
    phiIndicator: true,
    dataClass: 'PHI',
    patientRef: 'PSEUDO_IT',
    metadata: { accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records' },
    recordedAt: at(7),
  });
  // Cursor twins: identical recordedAt, distinct ids.
  await mk('twinX', { scopeLabId: LAB1, recordedAt: at(8) });
  await mk('twinY', { scopeLabId: LAB1, recordedAt: at(8) });
});
afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { producerModule: MARKER } });
  await prisma.$disconnect();
});

const idset = (page: any) => new Set(page.items.map((i: any) => i.id));

describe('AuditQueryService (real DB) — LAB scope isolation', () => {
  it('a LAB reader sees only its own lab; not other labs, SYSTEM, or stored CROSS_LAB rows', async () => {
    const page = await service.list({ principal: P({ labId: LAB1, permissions: [AUDIT_READ] }), filters: FILTERS });
    const got = idset(page);
    expect(got.has(ids.lab1a)).toBe(true);
    expect(got.has(ids.lab1b)).toBe(true);
    expect(got.has(ids.lab2)).toBe(false);
    expect(got.has(ids.system)).toBe(false);
    expect(got.has(ids.crosslab)).toBe(false);
  });
});

describe('AuditQueryService (real DB) — SYSTEM & CROSS_LAB query scope', () => {
  const sys = P({ labId: LAB1, permissions: [AUDIT_READ, AUDIT_SYSTEM_READ] });

  it('SYSTEM scope returns stored SYSTEM + CROSS_LAB rows, excludes LAB rows', async () => {
    const page = await service.list({ principal: sys, requestedScope: { scope: 'SYSTEM' }, filters: FILTERS });
    const got = idset(page);
    expect(got.has(ids.system)).toBe(true);
    expect(got.has(ids.crosslab)).toBe(true);
    expect(got.has(ids.lab1a)).toBe(false);
    expect(got.has(ids.lab2)).toBe(false);
  });

  it('CROSS_LAB scope returns only the selected lab’s LAB rows (not stored SYSTEM/CROSS_LAB)', async () => {
    const page = await service.list({ principal: sys, requestedScope: { scope: 'CROSS_LAB', labIds: [LAB2] }, filters: FILTERS });
    const got = idset(page);
    expect(got.has(ids.lab2)).toBe(true);
    expect(got.has(ids.lab1a)).toBe(false);
    expect(got.has(ids.system)).toBe(false);
    expect(got.has(ids.crosslab)).toBe(false);
  });
});

describe('AuditQueryService (real DB) — detail concealment', () => {
  const lab1 = P({ labId: LAB1, permissions: [AUDIT_READ] });
  it('returns a visible own-lab event', async () => {
    expect(await service.getById({ principal: lab1, id: ids.lab1a })).toMatchObject({ id: ids.lab1a });
  });
  it('another-lab, SYSTEM, and nonexistent all return null (existence never revealed)', async () => {
    expect(await service.getById({ principal: lab1, id: ids.lab2 })).toBeNull();
    expect(await service.getById({ principal: lab1, id: ids.system })).toBeNull();
    expect(await service.getById({ principal: lab1, id: 'does-not-exist' })).toBeNull();
  });
});

describe('AuditQueryService (real DB) — cursor with equal recordedAt', () => {
  it('paginates equal-timestamp rows by id with no duplicate or skip', async () => {
    const principal = P({ labId: LAB1, permissions: [AUDIT_READ] });
    const seen: string[] = [];
    let cursor: string | null | undefined;
    for (let i = 0; i < 20; i++) {
      const page: any = await service.list({ principal, filters: { ...FILTERS, pageSize: 1 }, cursor });
      seen.push(...page.items.map((r: any) => r.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length); // no duplicates
    expect(seen).toEqual(expect.arrayContaining([ids.twinX, ids.twinY])); // both twins surfaced
  });
});

describe('AuditQueryService (real DB) — PHI redaction', () => {
  it('base list redacts PHI metadata + omits patientRef; unknown version redacted', async () => {
    const page: any = await service.list({ principal: P({ labId: LAB1, permissions: [AUDIT_READ] }), filters: FILTERS });
    const phi = page.items.find((i: any) => i.id === ids.phi);
    expect(phi.metadataStatus).toBe('redacted_phi');
    expect(phi).not.toHaveProperty('patientRef');
    const unk = page.items.find((i: any) => i.id === ids.unknownver);
    expect(unk.metadataStatus).toBe('redacted_unknown_version');
  });

  it('PHI projection (with audit:read_phi) exposes patientRef', async () => {
    const page: any = await service.list({ principal: P({ labId: LAB1, permissions: [AUDIT_READ, AUDIT_PHI_READ] }), filters: FILTERS, phi: true });
    const phi = page.items.find((i: any) => i.id === ids.phi);
    expect(phi.patientRef).toBe('PSEUDO_IT');
    expect(phi.metadataStatus).toBe('included');
  });
});
