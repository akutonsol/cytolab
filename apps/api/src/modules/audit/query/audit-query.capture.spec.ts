import { AuditQueryService } from './audit-query.service';
import { AuditQueryReadCaptureGuard } from './audit-query-read-capture.guard';
import { AUDIT_READ, AUDIT_SYSTEM_READ, AUDIT_PHI_READ } from './audit-query.permissions';

class TestQueryService extends AuditQueryService {
  protected now(): Date {
    return new Date('2026-07-18T12:00:00Z');
  }
}

function svc(rows: any[] = []) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const findFirst = jest.fn().mockResolvedValue(rows[0] ?? null);
  const prisma = { auditEvent: { findMany, findFirst } } as any;
  const record = jest.fn().mockResolvedValue(undefined);
  const recorder = { recordAuditEventPhiAccessed: record } as any;
  const bridge = jest.fn((fn: any) => fn()); // runSystemAsCurrentActor
  const execCtx = { runSystemAsCurrentActor: bridge } as any;
  const service = new TestQueryService(prisma, recorder, execCtx, new AuditQueryReadCaptureGuard());
  return { service, record, bridge, findMany, findFirst };
}

const P = (perms: string[], labId = 'lab1') => ({ labId, permissions: perms }) as any;
const LAB_PHI = P([AUDIT_READ, AUDIT_PHI_READ]);
const SYS_PHI = P([AUDIT_READ, AUDIT_SYSTEM_READ, AUDIT_PHI_READ]);
const row = (id = 'e1') => ({
  id, occurredAt: new Date('2026-07-18T11:00:00Z'), recordedAt: new Date('2026-07-18T11:00:01Z'),
  schemaVersion: 1, eventVersion: 1, category: 'CONFIGURATION', severity: 'WARNING', phiIndicator: false,
  dataClass: 'INTERNAL', actorType: 'STAFF', actorId: 'u1', organizationScope: 'LAB', scopeLabId: 'lab1',
  resourceType: 'Lab', resourceId: 'lab1', actionCode: 'SETTING_CHANGED', outcome: 'SUCCESS', producerModule: 'lab',
  metadata: { settingKey: 'company_profile', scope: 'lab' },
});

describe('P2-7C — LAB PHI list capture', () => {
  it('emits exactly one LAB capture (no bridge), truthful resultCount, before returning', async () => {
    const { service, record, bridge } = svc([row('a'), row('b')]);
    const page = await service.list({ principal: LAB_PHI, phi: true });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      accessMode: 'list', queryScope: 'LAB', resultCount: 2, resource: { type: 'AuditEventCollection', id: 'audit-events' },
    }));
    expect(record.mock.calls[0][0].selectedLabCount).toBeUndefined();
    expect(bridge).not.toHaveBeenCalled(); // ordinary own-lab → LAB envelope, no SYSTEM bridge
    expect(page.items).toHaveLength(2);
  });

  it('a zero-result PHI list still emits one capture (resultCount 0)', async () => {
    const { service, record } = svc([]);
    await service.list({ principal: LAB_PHI, phi: true });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ resultCount: 0 }));
  });

  it('a base (non-PHI) list emits nothing', async () => {
    const { service, record } = svc([row('a')]);
    await service.list({ principal: P([AUDIT_READ]) });
    expect(record).not.toHaveBeenCalled();
  });
});

describe('P2-7C — LAB PHI detail capture', () => {
  it('emits one capture referencing the accessed AuditEvent (resultCount 1)', async () => {
    const { service, record } = svc([row('evtDetail')]);
    await service.getById({ principal: LAB_PHI, id: 'evtDetail', phi: true });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      accessMode: 'detail', queryScope: 'LAB', resultCount: 1, resource: { type: 'AuditEvent', id: 'evtDetail' },
    }));
  });

  it('an inaccessible/nonexistent detail (null) emits nothing', async () => {
    const { service, record } = svc([]); // findFirst → null
    expect(await service.getById({ principal: LAB_PHI, id: 'missing', phi: true })).toBeNull();
    expect(record).not.toHaveBeenCalled();
  });

  it('a base detail emits nothing', async () => {
    const { service, record } = svc([row('e1')]);
    await service.getById({ principal: P([AUDIT_READ]), id: 'e1' });
    expect(record).not.toHaveBeenCalled();
  });
});

describe('P2-7C — elevated (SYSTEM-scoped) capture', () => {
  it('SYSTEM list captures via the bridge with queryScope SYSTEM', async () => {
    const { service, record, bridge } = svc([row('s1')]);
    await service.list({ principal: SYS_PHI, requestedScope: { scope: 'SYSTEM' }, phi: true });
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ queryScope: 'SYSTEM' }));
  });

  it('CROSS_LAB list captures once (SYSTEM envelope) with selectedLabCount, no raw lab ids', async () => {
    const { service, record, bridge } = svc([]);
    await service.list({ principal: SYS_PHI, requestedScope: { scope: 'CROSS_LAB', labIds: ['a', 'b', 'c'] }, phi: true });
    expect(bridge).toHaveBeenCalledTimes(1);
    const arg = record.mock.calls[0][0];
    expect(arg).toMatchObject({ queryScope: 'CROSS_LAB', selectedLabCount: 3, resultCount: 0 });
    expect(JSON.stringify(arg)).not.toMatch(/"a"|"b"|"c"/); // no raw lab ids
  });

  it('a system reader selecting an explicit LAB captures SYSTEM-scoped with queryScope LAB', async () => {
    const { service, record, bridge } = svc([row('x')]);
    await service.list({ principal: SYS_PHI, requestedScope: { scope: 'LAB', labIds: ['labX'] }, phi: true });
    expect(bridge).toHaveBeenCalledTimes(1); // elevated authority → SYSTEM envelope
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ queryScope: 'LAB' }));
    expect(record.mock.calls[0][0].selectedLabCount).toBeUndefined();
  });
});

describe('P2-7C — fail-closed & no-duplicate', () => {
  it('a capture append failure PROPAGATES — the PHI page is not released', async () => {
    const { service, record } = svc([row('a')]);
    record.mockRejectedValue(new Error('append failed'));
    await expect(service.list({ principal: LAB_PHI, phi: true })).rejects.toThrow('append failed');
  });

  it('a capture failure never falls back to base and never returns PHI', async () => {
    const { service, record } = svc([row('a')]);
    record.mockRejectedValue(new Error('append failed'));
    await expect(service.getById({ principal: LAB_PHI, id: 'a', phi: true })).rejects.toThrow('append failed');
  });

  it('base queries remain available even when capture infra would fail', async () => {
    const { service, record } = svc([row('a')]);
    record.mockRejectedValue(new Error('append failed'));
    const page = await service.list({ principal: P([AUDIT_READ]) }); // base → no capture
    expect(page.items).toHaveLength(1);
  });

  it('a multi-row PHI list emits exactly once (no per-row fan-out)', async () => {
    const { service, record } = svc([row('a'), row('b'), row('c')]);
    await service.list({ principal: LAB_PHI, phi: true });
    expect(record).toHaveBeenCalledTimes(1);
  });
});
