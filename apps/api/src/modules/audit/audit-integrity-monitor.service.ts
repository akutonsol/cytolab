import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { AuditVerificationService } from './audit-verification.service';

/**
 * Program 2 · P2-R016B-C — Audit Integrity Monitoring (READ-ONLY, REPORT-ONLY).
 *
 * Operational monitoring around the canonical verifier. On startup (fire-and-forget) and on a schedule
 * it sweeps every audit chain and performs FULL integrity assessment — the deep verification the O(1)
 * B1 writer guard intentionally does not do:
 *   • full cryptographic verification via AuditVerificationService.verifyChain (recomputes every
 *     selfHash, validates every prevHash link, sequence continuity, and genesis), catching interior
 *     tampering even under an otherwise-consistent head; PLUS
 *   • a head↔terminal correspondence check (the verifier deliberately ignores the head), catching
 *     headless history, head-without-history, and stale heads.
 *
 * It NEVER mutates: no repair, no re-anchor, no quarantine state, no generation routing, no head/event
 * writes, no AuditRecorder. It only detects, classifies, logs, and exposes a cached health signal.
 * Recovery remains a separate, authorized checkpoint. This is not a hidden recovery path.
 */

export type ChainAssessmentStatus =
  | 'VERIFIED' // full verification passed AND head matches the terminal event
  | 'COMPROMISED' // an integrity defect was found (ledger or head↔ledger)
  | 'MONITORING_ERROR' // verification could not complete (DB/query/runtime) — NOT corruption
  | 'INCONCLUSIVE'; // the chain changed during assessment — an unstable observation, never reported clean

/** Overall monitor state, distinct from any single chain's status. */
export type MonitorState =
  | 'PENDING' // no sweep has completed yet
  | 'HEALTHY' // last sweep completed; every chain VERIFIED
  | 'DEGRADED' // last sweep found ≥1 COMPROMISED chain (integrity failure)
  | 'FAILED' // monitoring infrastructure failed (enumeration failed, or every chain errored)
  | 'PARTIAL'; // sweep finished but some chains were MONITORING_ERROR/INCONCLUSIVE (not conclusively clean)

/** Non-sensitive per-chain fingerprint used only to detect change during assessment. */
interface ChainFingerprint {
  count: number;
  maxSequence: string | null;
  headLastSelfHash: string | null;
  headLastSequence: string | null;
}

export interface ChainAssessment {
  chainId: string;
  status: ChainAssessmentStatus;
  /** A non-sensitive reason code (verifier kind or a head-correspondence kind); never PHI/payload. */
  reason: string | null;
  eventCount: number;
  maxSequence: string | null;
  headPresent: boolean;
}

export interface SweepReport {
  trigger: 'startup' | 'scheduled' | 'manual';
  state: MonitorState;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  totalChains: number;
  verified: number;
  compromised: number;
  monitoringErrors: number;
  inconclusive: number;
  /** Counts of failure reason codes across compromised chains (non-sensitive). */
  failuresByKind: Record<string, number>;
  /** Chain IDs (non-sensitive identifiers) that are compromised; bounded and safe to expose. */
  compromisedChainIds: string[];
  /** True only when every enumerated chain reached a terminal (non-error, non-inconclusive) verdict. */
  complete: boolean;
  /** Set only if the whole sweep could not run (enumeration failed). */
  infrastructureError?: string;
}

const NANOS_PER_MS = 1_000_000;

@Injectable()
export class AuditIntegrityMonitorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuditIntegrityMonitorService.name);

  /** Enabled by default; disable with AUDIT_INTEGRITY_MONITOR=false. Gates BOTH startup and cron. */
  private readonly enabled = process.env.AUDIT_INTEGRITY_MONITOR !== 'false';
  /**
   * Startup sweep can be independently suppressed (e.g. very large deployments) without disabling cron.
   * Also suppressed under NODE_ENV=test so app-bootstrap in the test harness never launches a background
   * sweep (unit tests drive runSweep directly).
   */
  private readonly startupEnabled =
    process.env.AUDIT_INTEGRITY_MONITOR_STARTUP !== 'false' && process.env.NODE_ENV !== 'test';
  /** Bounded verification concurrency; never an unbounded Promise.all over all chains. */
  private readonly concurrency = Math.max(1, Number(process.env.AUDIT_INTEGRITY_MONITOR_CONCURRENCY ?? 4));

  private running = false; // in-process overlap guard (no framework guard exists)
  private state: MonitorState = 'PENDING';
  private lastReport: SweepReport | null = null;
  private lastSuccessfulCompleteSweepAt: string | null = null;

  constructor(
    private readonly verifier: AuditVerificationService,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.enabled || !this.startupEnabled) {
      this.logger.log(`audit-integrity monitor startup sweep disabled (enabled=${this.enabled}, startup=${this.startupEnabled})`);
      return;
    }
    // Fire-and-forget: do NOT block application boot on an unbounded ledger scan. State stays PENDING
    // until the async sweep completes and populates the cached signal.
    void this.runSweep('startup').catch((e) =>
      this.logger.error(`audit-integrity startup sweep failed to launch: ${e?.message ?? e}`),
    );
  }

  /** Every 6 hours. Report-only; the body is fully guarded so a cron can never crash the process. */
  @Cron('0 */6 * * *')
  async scheduledSweep(): Promise<void> {
    if (!this.enabled) return;
    if (this.running) {
      this.logger.warn('audit-integrity scheduled sweep skipped: a sweep is already running');
      return;
    }
    try {
      await this.runSweep('scheduled');
    } catch (e: any) {
      this.logger.error(`audit-integrity scheduled sweep error: ${e?.message ?? e}`);
    }
  }

  // ── report-only accessors (synchronous, cheap; never trigger a live sweep) ──────────────────────

  getState(): MonitorState {
    return this.state;
  }

  getLastReport(): SweepReport | null {
    return this.lastReport;
  }

  /** A report-only health facet for SystemHealthService.getHealth(). Never mutates, never sweeps. */
  getHealthFacet(): { status: 'ok' | 'warn' | 'error'; value: number | null; message: string } {
    const r = this.lastReport;
    switch (this.state) {
      case 'PENDING':
        return { status: 'warn', value: null, message: 'audit chain integrity verification pending (no sweep completed yet)' };
      case 'HEALTHY':
        return { status: 'ok', value: r?.verified ?? 0, message: `all ${r?.verified ?? 0} audit chains verified` };
      case 'DEGRADED':
        return {
          status: 'error',
          value: r?.compromised ?? 0,
          message: `${r?.compromised ?? 0} audit chain(s) COMPROMISED: ${(r?.compromisedChainIds ?? []).join(', ')}`,
        };
      case 'FAILED':
        return { status: 'error', value: null, message: `audit integrity monitoring failed: ${r?.infrastructureError ?? 'verification could not complete'}` };
      case 'PARTIAL':
        return {
          status: 'warn',
          value: r?.compromised ?? 0,
          message: `audit integrity sweep incomplete (errors=${r?.monitoringErrors ?? 0}, inconclusive=${r?.inconclusive ?? 0})`,
        };
    }
  }

  // ── core ────────────────────────────────────────────────────────────────────────────────────────

  /** Distinct chain IDs that have EITHER events or a head (so headless & head-without-history are seen). */
  async enumerateChains(): Promise<string[]> {
    const [eventGroups, heads] = await Promise.all([
      this.prisma.auditEvent.groupBy({ by: ['chainId'], where: { chainId: { not: null } } }),
      this.prisma.auditChainHead.findMany({ select: { chainId: true } }),
    ]);
    const set = new Set<string>();
    for (const g of eventGroups) if (g.chainId) set.add(g.chainId);
    for (const h of heads) set.add(h.chainId);
    return [...set].sort();
  }

  private async fingerprint(chainId: string): Promise<ChainFingerprint> {
    const [count, agg, head] = await Promise.all([
      this.prisma.auditEvent.count({ where: { chainId } }),
      this.prisma.auditEvent.aggregate({ where: { chainId }, _max: { sequence: true } }),
      this.prisma.auditChainHead.findUnique({ where: { chainId } }),
    ]);
    return {
      count,
      maxSequence: agg._max.sequence == null ? null : agg._max.sequence.toString(),
      headLastSelfHash: head ? head.lastSelfHash : null,
      headLastSequence: head ? head.lastSequence.toString() : null,
    };
  }

  private stable(a: ChainFingerprint, b: ChainFingerprint): boolean {
    return (
      a.count === b.count &&
      a.maxSequence === b.maxSequence &&
      a.headLastSelfHash === b.headLastSelfHash &&
      a.headLastSequence === b.headLastSequence
    );
  }

  /**
   * Full read-only assessment of one chain: fingerprint → verify (crypto+linkage) + head↔terminal
   * correspondence → re-fingerprint. Any thrown error is a MONITORING_ERROR (not corruption). A change
   * between the two fingerprints yields INCONCLUSIVE (never a clean result from an unstable observation).
   */
  async assessChain(chainId: string): Promise<ChainAssessment> {
    try {
      const before = await this.fingerprint(chainId);

      let status: ChainAssessmentStatus;
      let reason: string | null = null;

      if (before.count === 0) {
        // Only reachable when a head exists over an empty ledger (else the chain would not be enumerated).
        status = 'COMPROMISED';
        reason = 'head_without_history';
      } else {
        const result = await this.verifier.verifyChain({ chainId }); // full crypto + linkage verification
        if (!result.verified) {
          status = 'COMPROMISED';
          reason = result.firstError?.kind ?? 'unverified';
        } else {
          // Ledger verifies; now the head↔terminal correspondence the verifier does not check.
          const head = await this.prisma.auditChainHead.findUnique({ where: { chainId } });
          const terminal = await this.prisma.auditEvent.findFirst({
            where: { chainId, sequence: BigInt(before.maxSequence as string) },
            select: { selfHash: true },
          });
          if (!head) {
            status = 'COMPROMISED';
            reason = 'headless_history';
          } else if (head.lastSequence.toString() !== before.maxSequence || !terminal || head.lastSelfHash !== terminal.selfHash) {
            status = 'COMPROMISED';
            reason = 'head_terminal_mismatch';
          } else {
            status = 'VERIFIED';
          }
        }
      }

      const after = await this.fingerprint(chainId);
      if (!this.stable(before, after)) {
        return { chainId, status: 'INCONCLUSIVE', reason: 'chain_changed_during_verification', eventCount: before.count, maxSequence: before.maxSequence, headPresent: before.headLastSelfHash != null };
      }
      return { chainId, status, reason, eventCount: before.count, maxSequence: before.maxSequence, headPresent: before.headLastSelfHash != null };
    } catch (e: any) {
      // Verification could not complete — a MONITORING failure, explicitly NOT a chain-corruption verdict.
      return { chainId, status: 'MONITORING_ERROR', reason: `monitoring_error:${e?.name ?? 'Error'}`, eventCount: 0, maxSequence: null, headPresent: false };
    }
  }

  /**
   * Run one full sweep. Enumeration failure → FAILED. Per-chain failures never abort the sweep.
   * `chainIds` may be supplied to scope the sweep (e.g. tests, or a future targeted re-check); when
   * omitted the sweep enumerates every chain.
   */
  async runSweep(trigger: SweepReport['trigger'], chainIds?: string[]): Promise<SweepReport> {
    if (this.running) {
      // Defensive: callers should check, but never run two concurrently.
      this.logger.warn(`audit-integrity ${trigger} sweep requested while one is running; returning last report`);
      return this.lastReport ?? this.emptyReport(trigger);
    }
    this.running = true;
    const start = process.hrtime.bigint();
    const startedAt = new Date().toISOString();
    this.logger.log(`audit-integrity sweep started (trigger=${trigger})`);

    try {
      let ids: string[];
      try {
        ids = chainIds ?? (await this.enumerateChains());
      } catch (e: any) {
        const report = this.emptyReport(trigger, startedAt);
        report.infrastructureError = `enumeration_failed:${e?.name ?? 'Error'}`;
        report.state = 'FAILED';
        report.completedAt = new Date().toISOString();
        report.durationMs = Number(process.hrtime.bigint() - start) / NANOS_PER_MS;
        this.publish(report);
        this.logger.error(`audit-integrity sweep FAILED: could not enumerate chains (${report.infrastructureError})`);
        return report;
      }

      const assessments = await this.mapBounded(ids, this.concurrency, (id) => this.assessChain(id));

      const report = this.summarize(trigger, startedAt, assessments);
      report.durationMs = Number(process.hrtime.bigint() - start) / NANOS_PER_MS;
      report.completedAt = new Date().toISOString();
      this.publish(report);

      // Per-incident structured logs (chainId + reason only; never payload/PHI).
      for (const a of assessments) {
        if (a.status === 'COMPROMISED') {
          this.logger.error(`AUDIT CHAIN INTEGRITY: COMPROMISED chain="${a.chainId}" reason=${a.reason} events=${a.eventCount}`);
        } else if (a.status === 'MONITORING_ERROR') {
          this.logger.warn(`AUDIT CHAIN INTEGRITY: monitoring error for chain="${a.chainId}" (${a.reason})`);
        } else if (a.status === 'INCONCLUSIVE') {
          this.logger.warn(`AUDIT CHAIN INTEGRITY: inconclusive (changed during verification) chain="${a.chainId}"`);
        }
      }
      this.logger.log(
        `audit-integrity sweep complete (trigger=${trigger}) state=${report.state} chains=${report.totalChains} ` +
          `verified=${report.verified} compromised=${report.compromised} errors=${report.monitoringErrors} ` +
          `inconclusive=${report.inconclusive} durationMs=${report.durationMs?.toFixed(1)}`,
      );
      return report;
    } finally {
      this.running = false;
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────────────────────────────────

  private summarize(trigger: SweepReport['trigger'], startedAt: string, assessments: ChainAssessment[]): SweepReport {
    const verified = assessments.filter((a) => a.status === 'VERIFIED').length;
    const compromised = assessments.filter((a) => a.status === 'COMPROMISED');
    const monitoringErrors = assessments.filter((a) => a.status === 'MONITORING_ERROR').length;
    const inconclusive = assessments.filter((a) => a.status === 'INCONCLUSIVE').length;
    const failuresByKind: Record<string, number> = {};
    for (const a of compromised) failuresByKind[a.reason ?? 'unknown'] = (failuresByKind[a.reason ?? 'unknown'] ?? 0) + 1;

    const complete = assessments.every((a) => a.status === 'VERIFIED' || a.status === 'COMPROMISED');
    let state: MonitorState;
    if (assessments.length > 0 && assessments.every((a) => a.status === 'MONITORING_ERROR')) state = 'FAILED';
    else if (compromised.length > 0) state = 'DEGRADED';
    else if (!complete) state = 'PARTIAL';
    else state = 'HEALTHY';

    return {
      trigger,
      state,
      startedAt,
      completedAt: null,
      durationMs: null,
      totalChains: assessments.length,
      verified,
      compromised: compromised.length,
      monitoringErrors,
      inconclusive,
      failuresByKind,
      compromisedChainIds: compromised.map((a) => a.chainId),
      complete,
    };
  }

  private publish(report: SweepReport): void {
    this.state = report.state;
    this.lastReport = report;
    if (report.state === 'HEALTHY') this.lastSuccessfulCompleteSweepAt = report.completedAt;
  }

  private emptyReport(trigger: SweepReport['trigger'], startedAt = new Date().toISOString()): SweepReport {
    return {
      trigger, state: this.state, startedAt, completedAt: null, durationMs: null, totalChains: 0,
      verified: 0, compromised: 0, monitoringErrors: 0, inconclusive: 0, failuresByKind: {},
      compromisedChainIds: [], complete: false,
    };
  }

  /** Bounded-concurrency map: at most `limit` assessments in flight at once (never unbounded). */
  private async mapBounded<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
    return results;
  }

  get lastSuccessfulSweepAt(): string | null {
    return this.lastSuccessfulCompleteSweepAt;
  }
}
