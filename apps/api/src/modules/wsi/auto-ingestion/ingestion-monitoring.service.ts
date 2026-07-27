import { Injectable } from '@nestjs/common';
import type { IngestionDiscoveryStatus, ProcessingJobStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { RECONCILIATION_EXCEPTION_STATES } from './dto/reconciliation.dto';
import type {
  DiscoveryCounts,
  IngestionMonitoringResponse,
  ProcessingCounts,
  SourceFact,
  SourceMonitor,
} from './dto/ingestion-monitoring.dto';

const DISCOVERY_STATUSES: IngestionDiscoveryStatus[] = [
  'DISCOVERED', 'STABILIZING', 'MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'DUPLICATE', 'INGESTED', 'FAILED', 'RECONCILED',
];
const PROCESSING_STATUSES: ProcessingJobStatus[] = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT'];
const EXCEPTION_SET = new Set<string>(RECONCILIATION_EXCEPTION_STATES);

const zeroDiscovery = (): DiscoveryCounts =>
  DISCOVERY_STATUSES.reduce((a, s) => ((a[s] = 0), a), {} as DiscoveryCounts);
const zeroProcessing = (): ProcessingCounts =>
  PROCESSING_STATUSES.reduce((a, s) => ((a[s] = 0), a), {} as ProcessingCounts);

/**
 * Program 5B · B5-a — read-only operational monitoring. Aggregates ONLY persisted, tenant-scoped truth:
 * IngestionSource (enabled state + kind — never the path), IngestionDiscovery (per-status/per-source tallies,
 * backlog, activity timestamps, persisted failure reasons), SlideProcessingJob (WATCH_FOLDER-scoped job
 * tallies), and DerivativeGeneration (READY outcomes on WATCH_FOLDER slides). No mutation, no new persistence,
 * no fabricated scanner/poller health, and no rootPath/secret is ever projected. READY is reported as READY —
 * never implied to be published or viewable.
 */
@Injectable()
export class IngestionMonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(nowIso: string): Promise<IngestionMonitoringResponse> {
    // ── Sources (infra-safe projection: id/kind/enabled only — NO rootPath, NO matchConfig). ──
    const sources = await this.prisma.ingestionSource.findMany({
      select: { id: true, kind: true, enabled: true },
      orderBy: { createdAt: 'asc' },
    });

    // ── Per-(source,status) discovery tallies. ──
    const discGroups = await this.prisma.ingestionDiscovery.groupBy({
      by: ['sourceId', 'status'],
      _count: { _all: true },
    });
    // ── Per-source aggregate timestamps (all tenant-scoped). ──
    const [lastActivity, lastIngested, oldestException, recentFailures] = await Promise.all([
      this.prisma.ingestionDiscovery.groupBy({ by: ['sourceId'], _max: { updatedAt: true } }),
      this.prisma.ingestionDiscovery.groupBy({ by: ['sourceId'], where: { status: 'INGESTED' }, _max: { updatedAt: true } }),
      this.prisma.ingestionDiscovery.groupBy({
        by: ['sourceId'],
        where: { status: { in: RECONCILIATION_EXCEPTION_STATES as unknown as IngestionDiscoveryStatus[] } },
        _min: { discoveredAt: true },
      }),
      // Latest FAILED row per source (distinct + desc order → first row per sourceId is the most recent).
      this.prisma.ingestionDiscovery.findMany({
        where: { status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        distinct: ['sourceId'],
        select: { sourceId: true, failureReason: true, updatedAt: true },
      }),
    ]);

    // ── READY generations on WATCH_FOLDER slides, mapped back to their source via INGESTED discoveries. ──
    const [readyRows, ingestedSlides] = await Promise.all([
      this.prisma.derivativeGeneration.groupBy({
        by: ['slideId'],
        where: { status: 'READY', slide: { sourceKind: 'WATCH_FOLDER' } },
        _count: { _all: true },
      }),
      this.prisma.ingestionDiscovery.findMany({
        where: { status: 'INGESTED', resultingSlideId: { not: null } },
        select: { sourceId: true, resultingSlideId: true },
      }),
    ]);
    const readySlideIds = new Set(readyRows.map((r) => r.slideId));
    const readyPerSource = new Map<string, number>();
    for (const d of ingestedSlides) {
      if (d.resultingSlideId && readySlideIds.has(d.resultingSlideId)) {
        readyPerSource.set(d.sourceId, (readyPerSource.get(d.sourceId) ?? 0) + 1);
      }
    }

    // ── Lab-wide processing tallies for the automated (WATCH_FOLDER) path. ──
    const procGroups = await this.prisma.slideProcessingJob.groupBy({
      by: ['status'],
      where: { ingestion: { sourceKind: 'WATCH_FOLDER' } },
      _count: { _all: true },
    });
    const processing = zeroProcessing();
    for (const g of procGroups) processing[g.status] = g._count._all;

    // ── Index per-source aggregates. ──
    const bySource = new Map<string, DiscoveryCounts>();
    for (const g of discGroups) {
      const c = bySource.get(g.sourceId) ?? zeroDiscovery();
      c[g.status] = g._count._all;
      bySource.set(g.sourceId, c);
    }
    const lastActBy = new Map(lastActivity.map((r) => [r.sourceId, r._max.updatedAt ?? null]));
    const lastIngBy = new Map(lastIngested.map((r) => [r.sourceId, r._max.updatedAt ?? null]));
    const oldestExcBy = new Map(oldestException.map((r) => [r.sourceId, r._min.discoveredAt ?? null]));
    const failBy = new Map(recentFailures.map((r) => [r.sourceId, r]));

    const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
    const backlogOf = (c: DiscoveryCounts) =>
      DISCOVERY_STATUSES.reduce((n, s) => (EXCEPTION_SET.has(s) ? n + c[s] : n), 0);

    const sourceMonitors: SourceMonitor[] = sources.map((s) => {
      const c = bySource.get(s.id) ?? zeroDiscovery();
      const backlog = backlogOf(c);
      const fail = failBy.get(s.id);
      const facts: SourceFact[] = [s.enabled ? 'ENABLED' : 'DISABLED'];
      if (backlog > 0) facts.push('HAS_BACKLOG');
      return {
        id: s.id,
        kind: s.kind,
        enabled: s.enabled,
        discoveryCounts: c,
        reconciliationBacklog: backlog,
        ingestedCount: c.INGESTED,
        readyCount: readyPerSource.get(s.id) ?? 0,
        oldestUnresolvedExceptionAt: iso(oldestExcBy.get(s.id) ?? null),
        lastActivityAt: iso(lastActBy.get(s.id) ?? null),
        lastIngestedAt: iso(lastIngBy.get(s.id) ?? null),
        recentFailureAt: iso(fail?.updatedAt ?? null),
        recentFailureReason: fail?.failureReason ?? null,
        facts,
      };
    });

    // ── Lab-wide totals (summed from the same persisted rows). ──
    const totalsDisc = zeroDiscovery();
    for (const c of bySource.values()) for (const s of DISCOVERY_STATUSES) totalsDisc[s] += c[s];
    const discoveriesTotal = DISCOVERY_STATUSES.reduce((n, s) => n + totalsDisc[s], 0);
    const reconciliationBacklog = backlogOf(totalsDisc);
    const readyTotal = readyRows.length; // number of WATCH_FOLDER slides with a READY generation

    const maxDate = (arr: (Date | null | undefined)[]) => {
      const ds = arr.filter((d): d is Date => !!d);
      return ds.length ? new Date(Math.max(...ds.map((d) => d.getTime()))) : null;
    };
    const minDate = (arr: (Date | null | undefined)[]) => {
      const ds = arr.filter((d): d is Date => !!d);
      return ds.length ? new Date(Math.min(...ds.map((d) => d.getTime()))) : null;
    };

    return {
      asOf: nowIso,
      totals: {
        sources: { total: sources.length, enabled: sources.filter((s) => s.enabled).length, disabled: sources.filter((s) => !s.enabled).length },
        discoveries: { ...totalsDisc, total: discoveriesTotal },
        reconciliationBacklog,
        processing,
        ready: readyTotal,
        oldestUnresolvedExceptionAt: iso(minDate(oldestException.map((r) => r._min.discoveredAt))),
        lastActivityAt: iso(maxDate(lastActivity.map((r) => r._max.updatedAt))),
        lastIngestedAt: iso(maxDate(lastIngested.map((r) => r._max.updatedAt))),
      },
      sources: sourceMonitors,
    };
  }
}
