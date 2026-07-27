import { IngestionMonitoringService } from './ingestion-monitoring.service';

/**
 * Program 5B · B5-a — proves the monitoring aggregation derives every value from persisted rows (groupBy
 * truth), buckets per-source correctly, computes the reconciliation backlog as the sum of the four exception
 * states, maps READY back to source via INGESTED discoveries, and NEVER projects rootPath/matchConfig.
 */
const D1 = new Date('2026-07-27T10:00:00.000Z');
const D2 = new Date('2026-07-27T11:00:00.000Z');
const DEXC = new Date('2026-07-27T09:00:00.000Z');

function svc() {
  const groupByImpl = (args: any) => {
    // by:['sourceId','status'] → per-source status counts
    if (Array.isArray(args.by) && args.by.includes('status') && args.by.includes('sourceId')) {
      return Promise.resolve([
        { sourceId: 's1', status: 'UNMATCHED', _count: { _all: 2 } },
        { sourceId: 's1', status: 'INGESTED', _count: { _all: 1 } },
        { sourceId: 's1', status: 'DISCOVERED', _count: { _all: 1 } },
        { sourceId: 's2', status: 'FAILED', _count: { _all: 1 } },
        { sourceId: 's2', status: 'DUPLICATE', _count: { _all: 1 } },
      ]);
    }
    // by:['sourceId'] with _min discoveredAt → oldest exception
    if (args._min?.discoveredAt) {
      return Promise.resolve([
        { sourceId: 's1', _min: { discoveredAt: DEXC } },
        { sourceId: 's2', _min: { discoveredAt: DEXC } },
      ]);
    }
    // by:['sourceId'] with _max updatedAt + where INGESTED → last ingested
    if (args._max?.updatedAt && args.where?.status === 'INGESTED') {
      return Promise.resolve([{ sourceId: 's1', _max: { updatedAt: D2 } }]);
    }
    // by:['sourceId'] with _max updatedAt → last activity
    if (args._max?.updatedAt) {
      return Promise.resolve([
        { sourceId: 's1', _max: { updatedAt: D2 } },
        { sourceId: 's2', _max: { updatedAt: D1 } },
      ]);
    }
    return Promise.resolve([]);
  };

  const prisma: any = {
    ingestionSource: {
      findMany: jest.fn(async (args: any) => {
        // security projection: caller must select ONLY id/kind/enabled
        (prisma.ingestionSource as any)._lastSelect = args.select;
        return [
          { id: 's1', kind: 'FILESYSTEM', enabled: true },
          { id: 's2', kind: 'FILESYSTEM', enabled: false },
        ];
      }),
    },
    ingestionDiscovery: {
      groupBy: jest.fn(groupByImpl),
      findMany: jest.fn(async (args: any) => {
        if (args.where?.status === 'FAILED') {
          return [{ sourceId: 's2', failureReason: 'RECONCILE_HANDOFF_FAILED: store', updatedAt: D1 }];
        }
        // INGESTED resultingSlideId not null
        return [{ sourceId: 's1', resultingSlideId: 'slide-1' }];
      }),
    },
    derivativeGeneration: {
      groupBy: jest.fn(async () => [{ slideId: 'slide-1', _count: { _all: 1 } }]),
    },
    slideProcessingJob: {
      groupBy: jest.fn(async () => [
        { status: 'SUCCEEDED', _count: { _all: 3 } },
        { status: 'QUEUED', _count: { _all: 1 } },
      ]),
    },
  };
  return { service: new IngestionMonitoringService(prisma as any), prisma };
}

describe('P5B-B5a IngestionMonitoringService', () => {
  it('derives per-source + total truth from persisted groupBy rows', async () => {
    const { service } = svc();
    const out = await service.overview('2026-07-27T12:00:00.000Z');

    expect(out.asOf).toBe('2026-07-27T12:00:00.000Z');
    const s1 = out.sources.find((s) => s.id === 's1')!;
    const s2 = out.sources.find((s) => s.id === 's2')!;

    // per-source discovery tallies + backlog (UNMATCHED+AMBIGUOUS+DUPLICATE+FAILED)
    expect(s1.discoveryCounts.UNMATCHED).toBe(2);
    expect(s1.discoveryCounts.INGESTED).toBe(1);
    expect(s1.reconciliationBacklog).toBe(2);
    expect(s1.ingestedCount).toBe(1);
    expect(s1.readyCount).toBe(1); // slide-1 has a READY generation, mapped back to s1
    expect(s1.facts).toEqual(expect.arrayContaining(['ENABLED', 'HAS_BACKLOG']));
    expect(s1.recentFailureReason).toBeNull();
    expect(s1.lastIngestedAt).toBe(D2.toISOString());
    expect(s1.oldestUnresolvedExceptionAt).toBe(DEXC.toISOString());

    expect(s2.enabled).toBe(false);
    expect(s2.facts).toEqual(expect.arrayContaining(['DISABLED', 'HAS_BACKLOG']));
    expect(s2.reconciliationBacklog).toBe(2); // FAILED + DUPLICATE
    expect(s2.readyCount).toBe(0);
    expect(s2.recentFailureReason).toBe('RECONCILE_HANDOFF_FAILED: store');

    // totals
    expect(out.totals.sources).toEqual({ total: 2, enabled: 1, disabled: 1 });
    expect(out.totals.discoveries.total).toBe(6);
    expect(out.totals.reconciliationBacklog).toBe(4);
    expect(out.totals.processing.SUCCEEDED).toBe(3);
    expect(out.totals.processing.QUEUED).toBe(1);
    expect(out.totals.ready).toBe(1);
  });

  it('projects sources with ONLY id/kind/enabled — never rootPath/matchConfig (infra-safe)', async () => {
    const { service, prisma } = svc();
    const out = await service.overview('2026-07-27T12:00:00.000Z');
    expect(prisma.ingestionSource._lastSelect).toEqual({ id: true, kind: true, enabled: true });
    const json = JSON.stringify(out);
    expect(json).not.toContain('rootPath');
    expect(json).not.toContain('matchConfig');
    expect(json).not.toContain('/'); // no filesystem paths leak anywhere in the response
  });

  it('scopes processing + READY to the automated WATCH_FOLDER path', async () => {
    const { service, prisma } = svc();
    await service.overview('2026-07-27T12:00:00.000Z');
    expect(prisma.slideProcessingJob.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ingestion: { sourceKind: 'WATCH_FOLDER' } } }),
    );
    expect(prisma.derivativeGeneration.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'READY', slide: { sourceKind: 'WATCH_FOLDER' } }) }),
    );
  });
});
