import { ForbiddenException } from '@nestjs/common';
import { AuditExportCoordinator, MAX_AUDIT_EXPORT_ROWS } from './audit-export.coordinator';
import { AuditEventView, AuditEventPage, ResolvedAuditScope, AuditReaderPrincipal } from './audit-query.types';

const view = (id: string, over: Partial<AuditEventView> = {}): AuditEventView =>
  ({
    id,
    occurredAt: new Date('2026-07-18T10:00:00.000Z'),
    recordedAt: new Date('2026-07-18T10:00:01.000Z'),
    schemaVersion: 1,
    eventVersion: 1,
    category: 'SECURITY',
    actionCode: 'ACCOUNT_UNLOCKED',
    severity: 'NOTICE',
    dataClass: 'CONFIDENTIAL',
    phiIndicator: false,
    outcome: 'SUCCESS',
    actor: { type: 'USER', id: 'u1' },
    organization: { scope: 'LAB', labId: 'lab-1', organizationId: null },
    resource: { type: 'User', id: 'u2' },
    request: { requestId: null },
    session: { sessionId: null },
    correlationId: null,
    producerModule: 'security',
    metadataStatus: 'included',
    metadata: null,
    ...over,
  } as AuditEventView);

const page = (
  items: AuditEventView[],
  nextCursor: string | null,
  scope: ResolvedAuditScope = { kind: 'LAB', labId: 'lab-1' },
  phi = false,
): AuditEventPage<AuditEventView> => ({
  items,
  nextCursor,
  effective: { scope, timeFrom: new Date('2026-07-18T00:00:00Z'), timeTo: new Date('2026-07-18T12:00:00Z'), pageSize: 100, phi },
});

const LAB_PRINCIPAL: AuditReaderPrincipal = { labId: 'lab-1', permissions: ['audit:read'], isSuperRole: false };
const SYSTEM_PRINCIPAL: AuditReaderPrincipal = { labId: 'lab-1', permissions: ['audit:read', 'audit:read_system'], isSuperRole: false };

function makeCoordinator(opts: {
  pages?: AuditEventPage<AuditEventView>[];
  listImpl?: jest.Mock;
  captureImpl?: jest.Mock;
}) {
  const order: string[] = [];
  const queued = opts.pages ?? [page([view('a')], null)];
  let idx = 0;
  const list =
    opts.listImpl ??
    jest.fn(async () => {
      order.push('list');
      return queued[Math.min(idx++, queued.length - 1)];
    });
  const recordAuditExported = opts.captureImpl ?? jest.fn(async () => { order.push('capture'); });
  const runSystemAsCurrentActor = jest.fn(async (fn: () => Promise<void>) => { order.push('bridge'); return fn(); });

  const coordinator = new AuditExportCoordinator(
    { list } as any,
    { recordAuditExported } as any,
    { runSystemAsCurrentActor } as any,
  );
  return { coordinator, list, recordAuditExported, runSystemAsCurrentActor, order };
}

describe('P2-9A coordinator — orchestration & capture-before-egress', () => {
  it('assembles, serializes CSV, and captures exactly once AFTER assembly, then returns the artifact', async () => {
    const { coordinator, list, recordAuditExported, order } = makeCoordinator({});
    const art = await coordinator.export({ principal: LAB_PRINCIPAL, filters: {}, projection: 'base', format: 'csv' });

    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0][0]).toMatchObject({ phi: false });
    expect(recordAuditExported).toHaveBeenCalledTimes(1); // no automatic retry of the critical capture
    expect(order).toEqual(['list', 'capture']); // capture strictly after the read/assembly
    expect(art.contentType).toBe('text/csv; charset=utf-8');
    expect(art.filename).toBe('audit-export-base.csv');
    expect(art.cacheControl).toContain('no-store');
    expect(art.body.split('\r\n')[0]).toContain('id,occurredAt'); // certified header
  });

  it('captures final count/truncation/scope facts in metadata (base, no filters)', async () => {
    const { coordinator, recordAuditExported } = makeCoordinator({ pages: [page([view('a'), view('b')], null)] });
    await coordinator.export({ principal: LAB_PRINCIPAL, filters: {}, projection: 'base', format: 'ndjson' });
    expect(recordAuditExported).toHaveBeenCalledWith({
      projection: 'base',
      format: 'ndjson',
      queryScope: 'LAB',
      exportedCount: 2,
      truncated: false,
      cap: MAX_AUDIT_EXPORT_ROWS,
      filterClass: 'none',
    });
  });

  it('requests the PHI projection and stamps projection=phi', async () => {
    const { coordinator, list, recordAuditExported } = makeCoordinator({ pages: [page([view('a')], null, { kind: 'LAB', labId: 'lab-1' }, true)] });
    await coordinator.export({ principal: LAB_PRINCIPAL, filters: {}, projection: 'phi', format: 'csv' });
    expect(list.mock.calls[0][0]).toMatchObject({ phi: true });
    expect(recordAuditExported.mock.calls[0][0]).toMatchObject({ projection: 'phi' });
  });

  it('clamps a client cap above the server maximum', async () => {
    const { coordinator, recordAuditExported } = makeCoordinator({});
    await coordinator.export({ principal: LAB_PRINCIPAL, filters: {}, projection: 'base', format: 'csv', cap: 999_999 });
    expect(recordAuditExported.mock.calls[0][0].cap).toBe(MAX_AUDIT_EXPORT_ROWS);
  });

  it('records selectedLabCount only for CROSS_LAB', async () => {
    const { coordinator, recordAuditExported } = makeCoordinator({
      pages: [page([view('a')], null, { kind: 'CROSS_LAB', labIds: ['l1', 'l2'] })],
    });
    await coordinator.export({ principal: SYSTEM_PRINCIPAL, requestedScope: { scope: 'CROSS_LAB', labIds: ['l1', 'l2'] }, filters: {}, projection: 'base', format: 'csv' });
    expect(recordAuditExported.mock.calls[0][0]).toMatchObject({ queryScope: 'CROSS_LAB', selectedLabCount: 2 });
  });
});

describe('P2-9A coordinator — SYSTEM bridge & fail-closed', () => {
  it('captures via the SYSTEM bridge for an elevated (audit:read_system) reader', async () => {
    const { coordinator, runSystemAsCurrentActor, order } = makeCoordinator({});
    await coordinator.export({ principal: SYSTEM_PRINCIPAL, filters: {}, projection: 'base', format: 'csv' });
    expect(runSystemAsCurrentActor).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['list', 'bridge', 'capture']);
  });

  it('captures directly (no bridge) for an ordinary LAB reader', async () => {
    const { coordinator, runSystemAsCurrentActor } = makeCoordinator({});
    await coordinator.export({ principal: LAB_PRINCIPAL, filters: {}, projection: 'base', format: 'csv' });
    expect(runSystemAsCurrentActor).not.toHaveBeenCalled();
  });

  it('R-016 / any capture failure fails closed — export rejects and returns no artifact', async () => {
    const captureImpl = jest.fn(async () => { throw new Error('audit chain sequence collision'); });
    const { coordinator } = makeCoordinator({ captureImpl });
    await expect(
      coordinator.export({ principal: SYSTEM_PRINCIPAL, requestedScope: { scope: 'SYSTEM' }, filters: {}, projection: 'base', format: 'csv' }),
    ).rejects.toThrow();
    // The controller only writes bytes from a returned artifact; a rejection means zero egress.
  });

  it('propagates an authorization denial from the frozen reader and never captures', async () => {
    const listImpl = jest.fn(async () => { throw new ForbiddenException('PHI audit projection requires audit:read_phi'); });
    const { coordinator, recordAuditExported } = makeCoordinator({ listImpl });
    await expect(
      coordinator.export({ principal: LAB_PRINCIPAL, filters: {}, projection: 'phi', format: 'csv' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(recordAuditExported).not.toHaveBeenCalled(); // no capture on a denied read
  });
});
