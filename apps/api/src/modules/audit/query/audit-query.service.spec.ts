import { ForbiddenException } from '@nestjs/common';
import { AuditQueryService } from './audit-query.service';
import { AUDIT_READ, AUDIT_SYSTEM_READ, AUDIT_PHI_READ } from './audit-query.permissions';
import { encodeAuditCursor } from './audit-query.cursor';

/** now() pinned for deterministic default windows. */
class TestQueryService extends AuditQueryService {
  protected now(): Date {
    return new Date('2026-07-18T12:00:00Z');
  }
}

function svc(rows: any[] = []) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const findFirst = jest.fn().mockResolvedValue(rows[0] ?? null);
  const prisma = { auditEvent: { findMany, findFirst } } as any;
  return { service: new TestQueryService(prisma), findMany, findFirst, prisma };
}

const P = (over: Partial<{ labId: string; permissions: string[]; isSuperRole: boolean }>) => ({ permissions: [], ...over }) as any;
const LAB = P({ labId: 'lab1', permissions: [AUDIT_READ] });
const SYS = P({ labId: 'lab1', permissions: [AUDIT_READ, AUDIT_SYSTEM_READ] });

const row = (over: any = {}) => ({
  id: 'evt1',
  occurredAt: new Date('2026-07-18T11:00:00Z'),
  recordedAt: new Date('2026-07-18T11:00:01Z'),
  schemaVersion: 1,
  eventVersion: 1,
  category: 'CONFIGURATION',
  severity: 'WARNING',
  phiIndicator: false,
  dataClass: 'INTERNAL',
  actorType: 'STAFF',
  actorId: 'u1',
  organizationScope: 'LAB',
  scopeLabId: 'lab1',
  resourceType: 'Lab',
  resourceId: 'lab1',
  actionCode: 'SETTING_CHANGED',
  outcome: 'SUCCESS',
  producerModule: 'lab',
  metadata: { settingKey: 'company_profile', scope: 'lab' },
  ...over,
});

const andOf = (findMany: jest.Mock) => findMany.mock.calls[0][0].where.AND;

describe('AuditQueryService — P2-7B scope predicates', () => {
  it('LAB reader → organizationScope=LAB AND scopeLabId=own lab (cannot select another)', async () => {
    const { service, findMany } = svc([row()]);
    await service.list({ principal: LAB });
    expect(andOf(findMany)[0]).toEqual({ organizationScope: 'LAB', scopeLabId: 'lab1' });
  });

  it('LAB reader requesting SYSTEM/CROSS_LAB is forbidden (no prisma call)', async () => {
    const { service, findMany } = svc();
    await expect(service.list({ principal: LAB, requestedScope: { scope: 'SYSTEM' } })).rejects.toThrow(ForbiddenException);
    await expect(service.list({ principal: LAB, requestedScope: { scope: 'CROSS_LAB', labIds: ['a'] } })).rejects.toThrow(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('lone audit:read_system (no audit:read) is denied', async () => {
    const { service } = svc();
    await expect(service.list({ principal: P({ labId: 'lab1', permissions: [AUDIT_SYSTEM_READ] }) })).rejects.toThrow(ForbiddenException);
  });

  it('SYSTEM reader default → organizationScope IN (SYSTEM, CROSS_LAB), not all LAB rows', async () => {
    const { service, findMany } = svc([]);
    await service.list({ principal: SYS });
    expect(andOf(findMany)[0]).toEqual({ organizationScope: { in: ['SYSTEM', 'CROSS_LAB'] } });
  });

  it('SYSTEM reader may select a single LAB, or a bounded CROSS_LAB set of LAB rows', async () => {
    const a = svc([]);
    await a.service.list({ principal: SYS, requestedScope: { scope: 'LAB', labIds: ['labX'] } });
    expect(andOf(a.findMany)[0]).toEqual({ organizationScope: 'LAB', scopeLabId: 'labX' });

    const b = svc([]);
    await b.service.list({ principal: SYS, requestedScope: { scope: 'CROSS_LAB', labIds: ['l1', 'l2'] } });
    expect(andOf(b.findMany)[0]).toEqual({ organizationScope: 'LAB', scopeLabId: { in: ['l1', 'l2'] } });
  });
});

describe('AuditQueryService — filters, cursor, ordering, paging', () => {
  it('defaults to a 24h window and applies allow-listed filters', async () => {
    const { service, findMany } = svc([]);
    await service.list({ principal: LAB, filters: { category: ['SECURITY'] as any, actorId: 'u9', outcome: 'SUCCESS' as any } });
    const and = andOf(findMany);
    expect(and[1]).toMatchObject({
      recordedAt: { gte: new Date('2026-07-17T12:00:00Z'), lte: new Date('2026-07-18T12:00:00Z') },
      category: { in: ['SECURITY'] },
      actorId: 'u9',
      outcome: 'SUCCESS',
    });
  });

  it('orders by recordedAt desc, id desc and takes pageSize + 1', async () => {
    const { service, findMany } = svc([]);
    await service.list({ principal: LAB, filters: { pageSize: 10 } });
    const call = findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ recordedAt: 'desc' }, { id: 'desc' }]);
    expect(call.take).toBe(11);
  });

  it('cursor produces the exact keyset continuation predicate', async () => {
    const { service, findMany } = svc([]);
    const cur = { recordedAt: new Date('2026-07-18T10:00:00Z'), id: 'evtCursor' };
    await service.list({ principal: LAB, cursor: encodeAuditCursor(cur) });
    expect(andOf(findMany)[2]).toEqual({
      OR: [{ recordedAt: { lt: cur.recordedAt } }, { recordedAt: cur.recordedAt, id: { lt: 'evtCursor' } }],
    });
  });

  it('emits nextCursor from the last returned item only when an extra row exists', async () => {
    const pageSize = 2;
    const rows = [row({ id: 'a' }), row({ id: 'b', recordedAt: new Date('2026-07-18T10:59:00Z') }), row({ id: 'c' })];
    const { service } = svc(rows);
    const page = await service.list({ principal: LAB, filters: { pageSize } });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe(encodeAuditCursor({ recordedAt: rows[1].recordedAt, id: 'b' }));
  });

  it('returns null nextCursor when there is no extra row', async () => {
    const { service } = svc([row({ id: 'a' })]);
    const page = await service.list({ principal: LAB, filters: { pageSize: 50 } });
    expect(page.nextCursor).toBeNull();
  });

  it('never performs a count query', async () => {
    const { service, prisma } = svc([]);
    await service.list({ principal: LAB });
    expect(prisma.auditEvent.count).toBeUndefined();
  });
});

describe('AuditQueryService — projection & PHI', () => {
  it('base list omits patientRef and does not select it', async () => {
    const { service, findMany } = svc([row()]);
    const page = await service.list({ principal: LAB });
    expect(page.items[0]).not.toHaveProperty('patientRef');
    expect(findMany.mock.calls[0][0].select.patientRef).toBeUndefined();
  });

  it('base list redacts a known PHI-bearing event and does not select patientRef', async () => {
    const phiRow = row({ category: 'PHI_ACCESS', actionCode: 'PATIENT_RECORD_VIEWED', phiIndicator: true, metadata: { accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records' } });
    const { service } = svc([phiRow]);
    const page = await service.list({ principal: LAB });
    expect(page.items[0].metadataStatus).toBe('redacted_phi');
    expect(page.items[0].metadata).toBeNull();
  });

  it('includePhi requires audit:read_phi; audit:read_system alone does not grant it', async () => {
    const { service } = svc([]);
    await expect(service.list({ principal: SYS, phi: true })).rejects.toThrow(ForbiddenException);
  });

  it('PHI projection selects + exposes patientRef for an authorized reader', async () => {
    const phiRow = row({ category: 'PHI_ACCESS', actionCode: 'PATIENT_RECORD_VIEWED', phiIndicator: true, patientRef: 'PSEUDO1', metadata: { accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records' } });
    const principal = P({ labId: 'lab1', permissions: [AUDIT_READ, AUDIT_PHI_READ] });
    const { service, findMany } = svc([phiRow]);
    const page = await service.list({ principal, phi: true });
    expect(findMany.mock.calls[0][0].select.patientRef).toBe(true);
    expect((page.items[0] as any).patientRef).toBe('PSEUDO1');
  });

  it('an unknown event version is redacted, not thrown (page survives)', async () => {
    const { service } = svc([row({ eventVersion: 999 })]);
    const page = await service.list({ principal: LAB });
    expect(page.items[0].metadataStatus).toBe('redacted_unknown_version');
    expect(page.items[0].metadata).toBeNull();
  });
});

describe('AuditQueryService — detail concealment', () => {
  it('LAB reader detail applies id + own-lab scope in the predicate', async () => {
    const { service, findFirst } = svc([row()]);
    await service.getById({ principal: LAB, id: 'evt1' });
    expect(findFirst.mock.calls[0][0].where.AND).toEqual([{ id: 'evt1' }, { organizationScope: 'LAB', scopeLabId: 'lab1' }]);
  });

  it('a missing / out-of-scope event both return null (existence never revealed)', async () => {
    const { service } = svc([]); // findFirst → null
    await expect(service.getById({ principal: LAB, id: 'whatever' })).resolves.toBeNull();
  });

  it('SYSTEM reader detail has full visibility (id only, no scope restriction)', async () => {
    const { service, findFirst } = svc([row({ organizationScope: 'SYSTEM', scopeLabId: null })]);
    await service.getById({ principal: SYS, id: 'evt1' });
    expect(findFirst.mock.calls[0][0].where.AND).toEqual([{ id: 'evt1' }, {}]);
  });
});

describe('AuditQueryService — read-only surface', () => {
  it('never calls a mutation method (only findMany/findFirst exist on the client it uses)', async () => {
    const { service, prisma } = svc([row()]);
    await service.list({ principal: LAB });
    await service.getById({ principal: LAB, id: 'evt1' });
    for (const m of ['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert']) {
      expect(prisma.auditEvent[m]).toBeUndefined();
    }
  });
  it('exposes list + getById and no mutation-named public method', () => {
    const { service } = svc();
    expect(typeof (service as any).list).toBe('function');
    expect(typeof (service as any).getById).toBe('function');
    for (const m of ['create', 'update', 'delete', 'upsert', 'remove', 'save', 'write']) {
      expect((service as any)[m]).toBeUndefined();
    }
  });
});
