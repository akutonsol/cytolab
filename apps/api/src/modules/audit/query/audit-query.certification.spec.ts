import { ForbiddenException } from '@nestjs/common';
import { AuditQueryService } from './audit-query.service';
import { AuditQueryReadCaptureGuard } from './audit-query-read-capture.guard';
import { AUDIT_READ, AUDIT_SYSTEM_READ, AUDIT_PHI_READ } from './audit-query.permissions';

/**
 * Program 2 · P2-7D — certification: exactly-once capture across the coverage matrix, fail-closed
 * under guard failure, concurrency isolation, and a consolidated authorization matrix. No production
 * code is changed by this checkpoint; these are hardening proofs over the frozen P2-7A/B/C behavior.
 */
class TestQueryService extends AuditQueryService {
  protected now(): Date {
    return new Date('2026-07-18T12:00:00Z');
  }
}

const row = (id: string) => ({
  id, occurredAt: new Date('2026-07-18T11:00:00Z'), recordedAt: new Date('2026-07-18T11:00:01Z'),
  schemaVersion: 1, eventVersion: 1, category: 'CONFIGURATION', severity: 'WARNING', phiIndicator: false,
  dataClass: 'INTERNAL', actorType: 'STAFF', actorId: 'u1', organizationScope: 'LAB', scopeLabId: 'lab1',
  resourceType: 'Lab', resourceId: 'lab1', actionCode: 'SETTING_CHANGED', outcome: 'SUCCESS', producerModule: 'lab',
  metadata: { settingKey: 'k', scope: 'lab' },
});

function svc(opts: { rows?: any[]; guard?: any; record?: jest.Mock } = {}) {
  const rows = opts.rows ?? [];
  const findMany = jest.fn().mockResolvedValue(rows);
  const findFirst = jest.fn().mockResolvedValue(rows[0] ?? null);
  const prisma = { auditEvent: { findMany, findFirst } } as any;
  const record = opts.record ?? jest.fn().mockResolvedValue(undefined);
  const recorder = { recordAuditEventPhiAccessed: record } as any;
  const bridge = jest.fn((fn: any) => fn());
  const execCtx = { runSystemAsCurrentActor: bridge } as any;
  const service = new TestQueryService(prisma, recorder, execCtx, opts.guard ?? new AuditQueryReadCaptureGuard());
  return { service, record, bridge, findMany };
}

const P = (perms: string[], labId: string | null = 'lab1') => ({ labId, permissions: perms }) as any;
const LAB_PHI = P([AUDIT_READ, AUDIT_PHI_READ]);
const SYS_PHI = P([AUDIT_READ, AUDIT_SYSTEM_READ, AUDIT_PHI_READ]);

describe('P2-7D — exactly-once capture across the coverage matrix', () => {
  const cases = [
    { name: 'LAB list', principal: LAB_PHI, scope: undefined, expectScope: 'LAB', bridge: false },
    { name: 'SYSTEM list', principal: SYS_PHI, scope: { scope: 'SYSTEM' as const }, expectScope: 'SYSTEM', bridge: true },
    { name: 'CROSS_LAB list', principal: SYS_PHI, scope: { scope: 'CROSS_LAB' as const, labIds: ['a', 'b'] }, expectScope: 'CROSS_LAB', bridge: true },
    { name: 'elevated explicit LAB', principal: SYS_PHI, scope: { scope: 'LAB' as const, labIds: ['labX'] }, expectScope: 'LAB', bridge: true },
  ];
  for (const c of cases) {
    it(`${c.name} (PHI) → exactly one capture, queryScope=${c.expectScope}`, async () => {
      const { service, record, bridge } = svc({ rows: [row('a'), row('b')] });
      await service.list({ principal: c.principal, requestedScope: c.scope, phi: true });
      expect(record).toHaveBeenCalledTimes(1);
      expect(record.mock.calls[0][0].queryScope).toBe(c.expectScope);
      expect(bridge).toHaveBeenCalledTimes(c.bridge ? 1 : 0);
    });
  }

  it('single-result list → one capture (resultCount 1)', async () => {
    const { service, record } = svc({ rows: [row('only')] });
    await service.list({ principal: LAB_PHI, filters: { pageSize: 50 }, phi: true });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0].resultCount).toBe(1);
  });

  it('a full page (hasMore) still emits exactly ONE capture per request (not per data page)', async () => {
    // pageSize 2 with 3 rows → hasMore true, one item trimmed; one capture, hasMore=true.
    const { service, record } = svc({ rows: [row('a'), row('b'), row('c')] });
    const page = await service.list({ principal: LAB_PHI, filters: { pageSize: 2 }, phi: true });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({ resultCount: 2, hasMore: true });
    expect(page.nextCursor).not.toBeNull();
  });

  it('iterating N page-requests emits N captures (one per request)', async () => {
    const { service, record } = svc({ rows: [row('a')] });
    for (let i = 0; i < 3; i++) await service.list({ principal: LAB_PHI, phi: true });
    expect(record).toHaveBeenCalledTimes(3);
  });

  it('base projection across the matrix emits nothing', async () => {
    const { service, record } = svc({ rows: [row('a')] });
    await service.list({ principal: P([AUDIT_READ]) });
    await service.list({ principal: P([AUDIT_READ, AUDIT_SYSTEM_READ]), requestedScope: { scope: 'SYSTEM' } });
    await service.getById({ principal: P([AUDIT_READ]), id: 'a' });
    expect(record).not.toHaveBeenCalled();
  });
});

describe('P2-7D — fail-closed under guard/recorder failure', () => {
  it('a guard failure withholds the PHI response (no fallback)', async () => {
    const guard = { isCapturing: () => false, runCapture: () => Promise.reject(new Error('guard down')) };
    const { service } = svc({ rows: [row('a')], guard });
    await expect(service.list({ principal: LAB_PHI, phi: true })).rejects.toThrow('guard down');
  });

  it('a recorder append failure withholds PHI on both list and detail', async () => {
    const record = jest.fn().mockRejectedValue(new Error('append down'));
    const l = svc({ rows: [row('a')], record });
    await expect(l.service.list({ principal: LAB_PHI, phi: true })).rejects.toThrow('append down');
    const d = svc({ rows: [row('a')], record });
    await expect(d.service.getById({ principal: LAB_PHI, id: 'a', phi: true })).rejects.toThrow('append down');
  });

  it('base queries stay available when capture would fail', async () => {
    const record = jest.fn().mockRejectedValue(new Error('append down'));
    const { service } = svc({ rows: [row('a')], record });
    await expect(service.list({ principal: P([AUDIT_READ]) })).resolves.toMatchObject({ items: [expect.any(Object)] });
  });
});

describe('P2-7D — concurrency & context isolation', () => {
  it('N concurrent PHI requests through ONE service each capture exactly once (no dup/miss)', async () => {
    const record = jest.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 3)));
    const { service } = svc({ rows: [row('a')], record });
    await Promise.all(Array.from({ length: 25 }, () => service.list({ principal: LAB_PHI, phi: true })));
    expect(record).toHaveBeenCalledTimes(25);
  });

  it('concurrent LAB and SYSTEM readers do not leak scope (each captures its own queryScope)', async () => {
    const record = jest.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 2)));
    const { service } = svc({ rows: [row('a')], record });
    await Promise.all([
      service.list({ principal: LAB_PHI, phi: true }),
      service.list({ principal: SYS_PHI, requestedScope: { scope: 'SYSTEM' }, phi: true }),
      service.list({ principal: LAB_PHI, phi: true }),
    ]);
    const scopes = record.mock.calls.map((c) => c[0].queryScope).sort();
    expect(scopes).toEqual(['LAB', 'LAB', 'SYSTEM']);
  });
});

describe('P2-7D — consolidated authorization matrix', () => {
  const M: Array<[string, any, any, boolean, boolean]> = [
    // [name, permissions, {phi, scope}, allowed, capture]
    ['no perms', P([]), {}, false, false],
    ['system:security is not audit read', P(['system:security']), {}, false, false],
    ['audit:read → LAB base', P([AUDIT_READ]), {}, true, false],
    ['audit:read requests SYSTEM → denied', P([AUDIT_READ]), { scope: { scope: 'SYSTEM' } }, false, false],
    ['audit:read requests PHI → denied (no phi perm)', P([AUDIT_READ]), { phi: true }, false, false],
    ['read+phi → LAB PHI captures', P([AUDIT_READ, AUDIT_PHI_READ]), { phi: true }, true, true],
    ['read_system alone (no read) → denied', P([AUDIT_SYSTEM_READ]), { scope: { scope: 'SYSTEM' } }, false, false],
    ['read+read_system → SYSTEM base', P([AUDIT_READ, AUDIT_SYSTEM_READ]), { scope: { scope: 'SYSTEM' } }, true, false],
    ['read+read_system PHI → denied (no phi perm)', P([AUDIT_READ, AUDIT_SYSTEM_READ]), { scope: { scope: 'SYSTEM' }, phi: true }, false, false],
    ['read+read_system+phi → SYSTEM PHI captures', SYS_PHI, { scope: { scope: 'SYSTEM' }, phi: true }, true, true],
    ['superuser → SYSTEM PHI captures', P([], null), { scope: { scope: 'SYSTEM' }, phi: true }, true, true], // super set below
  ];
  for (const [name, principal, opt, allowed, capture] of M) {
    it(name, async () => {
      const pr = name.startsWith('superuser') ? { ...principal, isSuperRole: true } : principal;
      const { service, record } = svc({ rows: [row('a')] });
      const run = () => service.list({ principal: pr, requestedScope: opt.scope, phi: opt.phi });
      if (allowed) {
        await expect(run()).resolves.toBeTruthy();
        expect(record).toHaveBeenCalledTimes(capture ? 1 : 0);
      } else {
        await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
        expect(record).not.toHaveBeenCalled();
      }
    });
  }
});
