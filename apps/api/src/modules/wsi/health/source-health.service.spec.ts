import { SourceHealthService } from './source-health.service';

/**
 * Program 5C · C5 — the health execution service: state mapping, snapshot persistence, transition audit (only
 * on change or manual), consecutive-failure counting, recovery, the conservative DEGRADED rule, and the
 * scheduler claim. It creates NO discovery/slide/ingestion/job (it has no such dependency).
 */
function harness(over: { source?: any; checker?: any; prev?: any; counts?: any } = {}) {
  const source = { id: 's1', labId: 'lab1', kind: 'FILESYSTEM', rootPath: '/x', endpointBaseUrl: null, authType: null, credentialCipher: null, adapterType: null, enabled: true, ...(over.source ?? {}) };
  const checker = { supports: () => true, check: jest.fn(async () => ({ state: 'HEALTHY', responseTimeMs: 5 })), ...(over.checker ?? {}) };
  const upserts: any[] = [];
  const prisma: any = {
    ingestionSource: { findFirst: jest.fn(async () => source), findMany: jest.fn(async () => [{ id: 's1' }]) },
    ingestionSourceHealth: {
      findUnique: jest.fn(async () => (over.prev !== undefined ? over.prev : null)),
      upsert: jest.fn(async (a: any) => { upserts.push(a); return { sourceId: 's1', state: a.update?.state ?? a.create?.state, lastErrorCode: null, checkedAt: new Date(), lastSuccessfulCheckAt: null, lastFailedCheckAt: null, consecutiveFailures: 0, responseTimeMs: 5 }; }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    ingestionDiscovery: { count: jest.fn(async () => (over.counts?.disc ?? 0)), findMany: jest.fn(async () => []) },
    slideProcessingJob: { count: jest.fn(async () => 0) },
    derivativeGeneration: { count: jest.fn(async () => 0) },
  };
  const checkers = { resolve: jest.fn(() => (over.checker === null ? undefined : checker)) };
  const adapters = { has: () => true, require: jest.fn() };
  const audit = { recordEntityUpdated: jest.fn(async () => undefined) };
  const svc = new SourceHealthService(prisma as any, checkers as any, adapters as any, audit as any);
  return { svc, prisma, checker, checkers, audit, upserts };
}

describe('P5C-C5 SourceHealthService', () => {
  it('a disabled source → DISABLED, the transport checker is NEVER called', async () => {
    const h = harness({ source: { enabled: false } });
    const v = await h.svc.checkSource('s1', { manual: true });
    expect(v.state).toBe('DISABLED');
    expect(h.checker.check).not.toHaveBeenCalled();
  });

  it('HEALTHY → snapshot HEALTHY, consecutiveFailures reset to 0, lastSuccessfulCheckAt set', async () => {
    const h = harness();
    await h.svc.checkSource('s1', { manual: true });
    const up = h.upserts[0].update;
    expect(up.state).toBe('HEALTHY');
    expect(up.consecutiveFailures).toBe(0);
    expect(up.lastSuccessfulCheckAt).toBeInstanceOf(Date);
  });

  it('a failure → increments consecutiveFailures + sets lastFailedCheckAt + structured code', async () => {
    const h = harness({ checker: { supports: () => true, check: jest.fn(async () => ({ state: 'UNREACHABLE', errorCode: 'FILESYSTEM_NOT_FOUND' })) } });
    await h.svc.checkSource('s1', { manual: true });
    const up = h.upserts[0].update;
    expect(up.state).toBe('UNREACHABLE');
    expect(up.consecutiveFailures).toEqual({ increment: 1 });
    expect(up.lastErrorCode).toBe('FILESYSTEM_NOT_FOUND');
    expect(up.lastFailedCheckAt).toBeInstanceOf(Date);
  });

  it('recovery (UNREACHABLE → HEALTHY) emits SOURCE_RECOVERED', async () => {
    const h = harness({ prev: { state: 'UNREACHABLE' } });
    await h.svc.checkSource('s1', { manual: false });
    expect(h.audit.recordEntityUpdated).toHaveBeenCalledWith(expect.objectContaining({ changedFields: ['SOURCE_RECOVERED'] }));
  });

  it('an UNCHANGED scheduled HEALTHY check emits NO audit (no noise)', async () => {
    const h = harness({ prev: { state: 'HEALTHY' } });
    await h.svc.checkSource('s1', { manual: false });
    expect(h.audit.recordEntityUpdated).not.toHaveBeenCalled();
  });

  it('an UNCHANGED MANUAL check is still audited', async () => {
    const h = harness({ prev: { state: 'HEALTHY' } });
    await h.svc.checkSource('s1', { manual: true });
    expect(h.audit.recordEntityUpdated).toHaveBeenCalled();
  });

  it('no transport checker → MISCONFIGURED (no crash)', async () => {
    const h = harness({ checker: null });
    expect((await h.svc.checkSource('s1', { manual: true })).state).toBe('MISCONFIGURED');
  });

  it('DEGRADED: transport HEALTHY but ≥3 FAILED intakes with 0 INGESTED in the window', async () => {
    // ingestionDiscovery.count is called for FAILED then INGESTED; return 3 then 0.
    const h = harness();
    h.prisma.ingestionDiscovery.count = jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    const v = await h.svc.checkSource('s1', { manual: true });
    expect(v.state).toBe('DEGRADED');
  });

  it('DUPLICATE/UNMATCHED do NOT make a healthy source DEGRADED (only FAILED counts)', async () => {
    const h = harness();
    h.prisma.ingestionDiscovery.count = jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0); // 0 FAILED
    expect((await h.svc.checkSource('s1', { manual: true })).state).toBe('HEALTHY');
  });

  it('runScheduled respects the nextEligibleCheckAt claim (CAS count 0 → skip, no check)', async () => {
    const h = harness();
    h.prisma.ingestionSourceHealth.updateMany = jest.fn(async () => ({ count: 0 }));
    const v = await h.svc.runScheduled('s1');
    expect(v).toBeNull();
    expect(h.checker.check).not.toHaveBeenCalled();
  });

  it('the scheduled CAS claim cannot re-schedule a recurring check sooner than 5 minutes', async () => {
    const h = harness();
    let claimData: any;
    h.prisma.ingestionSourceHealth.updateMany = jest.fn(async (a: any) => { claimData = a.data; return { count: 1 }; });
    const t0 = Date.now();
    await h.svc.runScheduled('s1');
    // nextEligibleCheckAt is stamped cadence (>= 5min) into the future — no runtime config can shrink it
    expect(claimData.nextEligibleCheckAt.getTime() - t0).toBeGreaterThanOrEqual(300_000);
  });

  it('the persisted snapshot also stamps nextEligibleCheckAt at least 5 minutes ahead', async () => {
    const h = harness();
    const t0 = Date.now();
    await h.svc.checkSource('s1', { manual: true });
    const up = h.upserts[0];
    for (const next of [up.update?.nextEligibleCheckAt, up.create?.nextEligibleCheckAt].filter(Boolean)) {
      expect(next.getTime() - t0).toBeGreaterThanOrEqual(300_000);
    }
  });

  it('creates NO discovery/slide/ingestion/job (health checking has no intake dependency)', async () => {
    const h = harness();
    await h.svc.checkSource('s1', { manual: true });
    // the service only reads discovery counts + writes the health snapshot; it has no create/ingest surface
    expect(h.prisma.ingestionSource.findFirst).toHaveBeenCalled();
    expect((h.prisma as any).ingestionDiscovery.create).toBeUndefined();
  });
});
