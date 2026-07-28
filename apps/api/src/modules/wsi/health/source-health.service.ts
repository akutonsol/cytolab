import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { SourceHealthState } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { tenantCreate } from '../../../common/tenancy/tenancy.extension';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { ScannerAdapterRegistry } from '../scanner/scanner-adapter-registry';
import { SourceHealthCheckerRegistry } from './source-health-checker-registry';
import { loadHealthConfig, type HealthConfig } from './health-config';
import type { ResolvedIngestionSource, SourceHealthResult } from './source-health';

export interface SourceHealthSnapshotView {
  sourceId: string;
  state: SourceHealthState;
  errorCode: string | null;
  checkedAt: string | null;
  lastSuccessfulCheckAt: string | null;
  lastFailedCheckAt: string | null;
  consecutiveFailures: number;
  responseTimeMs: number | null;
}

const HEALTHY_STATES: SourceHealthState[] = ['HEALTHY'];

/**
 * Program 5C · C5 — executes a health check for ONE ingestion source and persists the current snapshot. It
 * resolves the tenant-owned source, short-circuits DISABLED, runs the transport checker (with timeout), applies
 * the conservative DEGRADED rule, upserts the 1:1 snapshot, and emits an audit event ONLY on a state transition
 * (a manual check is always audited). It NEVER creates a discovery/slide/ingestion/job or triggers intake.
 */
@Injectable()
export class SourceHealthService {
  private readonly logger = new Logger(SourceHealthService.name);
  private readonly cfg: HealthConfig = loadHealthConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkers: SourceHealthCheckerRegistry,
    private readonly adapters: ScannerAdapterRegistry,
    private readonly audit: AuditRecorder,
  ) {}

  /** Manually check one source (always executes + audits). Returns the persisted snapshot view. */
  async checkSource(sourceId: string, opts: { manual?: boolean } = {}): Promise<SourceHealthSnapshotView> {
    const source = await this.prisma.ingestionSource.findFirst({
      where: { id: sourceId },
      select: { id: true, labId: true, kind: true, rootPath: true, endpointBaseUrl: true, authType: true, credentialCipher: true, adapterType: true, enabled: true },
    });
    if (!source) throw new NotFoundException('source not found');

    const prev = await this.prisma.ingestionSourceHealth.findUnique({ where: { sourceId }, select: { state: true } });
    const result = await this.evaluate(source);
    return this.persist(source.id, source.labId, prev?.state ?? null, result, !!opts.manual);
  }

  /** Scheduler path: claim the source via a `nextEligibleCheckAt` compare-and-set (multi-instance safe), then
   *  check only if this instance won the claim. Returns null if not eligible / claimed by another instance. */
  async runScheduled(sourceId: string): Promise<SourceHealthSnapshotView | null> {
    const now = new Date();
    // Ensure a snapshot exists (eligible immediately: nextEligibleCheckAt null on first sight).
    await this.prisma.ingestionSourceHealth
      .upsert({ where: { sourceId }, create: tenantCreate<any>({ sourceId, state: 'UNKNOWN' }), update: {} })
      .catch(() => undefined);
    const claim = await this.prisma.ingestionSourceHealth.updateMany({
      where: { sourceId, OR: [{ nextEligibleCheckAt: null }, { nextEligibleCheckAt: { lte: now } }] },
      data: { nextEligibleCheckAt: new Date(now.getTime() + this.cfg.cadenceMs) },
    });
    if (claim.count !== 1) return null; // not eligible, or claimed by a concurrent instance
    return this.checkSource(sourceId, { manual: false });
  }

  /** Manually check all enabled sources for the current lab. */
  async checkLab(): Promise<SourceHealthSnapshotView[]> {
    const sources = await this.prisma.ingestionSource.findMany({ where: { enabled: true }, select: { id: true } });
    const out: SourceHealthSnapshotView[] = [];
    for (const s of sources) out.push(await this.checkSource(s.id, { manual: true }));
    return out;
  }

  // ── evaluation ──────────────────────────────────────────────────────────────────────────────────────────
  private async evaluate(source: ResolvedIngestionSource & { labId: string }): Promise<SourceHealthResult> {
    if (!source.enabled) return { state: 'DISABLED' };
    const checker = this.checkers.resolve(source);
    if (!checker) return { state: 'MISCONFIGURED', errorCode: 'SOURCE_MISCONFIGURED' };

    const started = Date.now();
    let result: SourceHealthResult;
    try {
      result = await this.withTimeout(checker.check(source), this.cfg.timeoutMs);
    } catch (e) {
      result = (e as Error)?.message === '__timeout__'
        ? { state: 'UNREACHABLE', errorCode: 'HEALTH_CHECK_TIMEOUT', responseTimeMs: Date.now() - started }
        : { state: 'UNREACHABLE', errorCode: 'CHECK_INTERNAL_ERROR', responseTimeMs: Date.now() - started };
    }

    // A transport-HEALTHY source may still be DEGRADED on qualifying recent operational failures (conservative).
    if (HEALTHY_STATES.includes(result.state) && (await this.isDegraded(source.id))) {
      return { ...result, state: 'DEGRADED' };
    }
    return result;
  }

  /** DEGRADED (fixed C5 defaults, no tiny-sample ratio): reachable but ≥3 FAILED intakes with 0 INGESTED, OR
   *  ≥3 processing failures with 0 READY, in the operational window. DUPLICATE/UNMATCHED/etc. never count. */
  private async isDegraded(sourceId: string): Promise<boolean> {
    const since = new Date(Date.now() - this.cfg.degradedWindowMs);
    const [failedDisc, ingested, ingestedSlides] = await Promise.all([
      this.prisma.ingestionDiscovery.count({ where: { sourceId, status: 'FAILED', updatedAt: { gte: since } } }),
      this.prisma.ingestionDiscovery.count({ where: { sourceId, status: 'INGESTED', updatedAt: { gte: since } } }),
      this.prisma.ingestionDiscovery.findMany({ where: { sourceId, status: 'INGESTED', resultingIngestionId: { not: null } }, select: { resultingIngestionId: true, resultingSlideId: true } }),
    ]);
    if (failedDisc >= 3 && ingested === 0) return true;

    const ingestionIds = ingestedSlides.map((d) => d.resultingIngestionId!).filter(Boolean);
    const slideIds = ingestedSlides.map((d) => d.resultingSlideId!).filter(Boolean);
    if (ingestionIds.length) {
      const [failedJobs, readyGens] = await Promise.all([
        this.prisma.slideProcessingJob.count({ where: { ingestionId: { in: ingestionIds }, status: { in: ['FAILED', 'TIMED_OUT'] }, updatedAt: { gte: since } } }),
        slideIds.length ? this.prisma.derivativeGeneration.count({ where: { slideId: { in: slideIds }, status: 'READY' } }) : Promise.resolve(0),
      ]);
      if (failedJobs >= 3 && readyGens === 0) return true;
    }
    return false;
  }

  private async withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let t: NodeJS.Timeout;
    const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error('__timeout__')), ms); t.unref?.(); });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      clearTimeout(t!);
    }
  }

  // ── persistence + transition audit ──────────────────────────────────────────────────────────────────────
  private async persist(sourceId: string, labId: string, prevState: SourceHealthState | null, result: SourceHealthResult, manual: boolean): Promise<SourceHealthSnapshotView> {
    const now = new Date();
    const healthy = result.state === 'HEALTHY';
    const next = new Date(now.getTime() + this.cfg.cadenceMs);

    const snap = await this.prisma.ingestionSourceHealth.upsert({
      where: { sourceId },
      create: tenantCreate<any>({
        sourceId,
        state: result.state,
        checkedAt: now,
        lastSuccessfulCheckAt: healthy ? now : null,
        lastFailedCheckAt: healthy ? null : now,
        lastErrorCode: result.errorCode ?? null,
        consecutiveFailures: healthy ? 0 : 1,
        responseTimeMs: result.responseTimeMs ?? null,
        nextEligibleCheckAt: next,
      }),
      update: {
        state: result.state,
        checkedAt: now,
        ...(healthy ? { lastSuccessfulCheckAt: now, consecutiveFailures: 0 } : { lastFailedCheckAt: now, consecutiveFailures: { increment: 1 } }),
        lastErrorCode: result.errorCode ?? null,
        responseTimeMs: result.responseTimeMs ?? null,
        nextEligibleCheckAt: next,
      },
    });

    await this.auditTransition(sourceId, labId, prevState, result.state, manual);
    return this.view(snap);
  }

  private async auditTransition(sourceId: string, labId: string, prev: SourceHealthState | null, next: SourceHealthState, manual: boolean): Promise<void> {
    const transitioned = prev !== next;
    // Audit on a real transition (incl. recovery), OR always for a manual operator action. Never for an
    // unchanged scheduled HEALTHY check (avoids audit noise).
    if (!transitioned && !manual) return;
    const event = transitioned
      ? next === 'HEALTHY' ? 'SOURCE_RECOVERED' : `SOURCE_${next}`
      : 'HEALTH_CHECK';
    await this.audit
      .recordEntityUpdated({ resource: { type: 'IngestionSourceHealth', id: sourceId, labId }, changedFields: [event], producerModule: 'wsi-health' })
      .catch(() => undefined);
  }

  private view(s: { sourceId: string; state: SourceHealthState; lastErrorCode: string | null; checkedAt: Date | null; lastSuccessfulCheckAt: Date | null; lastFailedCheckAt: Date | null; consecutiveFailures: number; responseTimeMs: number | null }): SourceHealthSnapshotView {
    const iso = (d: Date | null) => (d ? d.toISOString() : null);
    return {
      sourceId: s.sourceId,
      state: s.state,
      errorCode: s.lastErrorCode,
      checkedAt: iso(s.checkedAt),
      lastSuccessfulCheckAt: iso(s.lastSuccessfulCheckAt),
      lastFailedCheckAt: iso(s.lastFailedCheckAt),
      consecutiveFailures: s.consecutiveFailures,
      responseTimeMs: s.responseTimeMs,
    };
  }
}
