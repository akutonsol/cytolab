import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { IngestionDiscoveryService } from './ingestion-discovery.service';
import { IngestionSourceService } from './ingestion-source.service';
import { AutomatedIngestionComposer } from './automated-ingestion-composer';
import { sha256File } from './watch-folder-processor';
import { isWithinRoot } from './watch-folder-scanner';
import {
  RECONCILIATION_EXCEPTION_STATES,
  isExceptionState,
  type ReconciliationExceptionState,
  type ReconciliationQueueQueryDto,
} from './dto/reconciliation.dto';

/** Safe row projection for the queue — NO root paths, absolute paths, object-store keys, or credentials. */
const QUEUE_SELECT = {
  id: true,
  status: true,
  sourceId: true,
  sourceRef: true,
  sizeBytes: true,
  sourceChecksum: true,
  discoveredAt: true,
  updatedAt: true,
  retryCount: true,
  failureReason: true,
  matchEvidence: true,
  reconciledById: true,
  reconciliationAction: true,
  reconciledAt: true,
} satisfies Prisma.IngestionDiscoverySelect;

/**
 * Program 5B · B4 — human exception & reconciliation workflows.
 *
 * The automated B2 path classifies exceptions (UNMATCHED / AMBIGUOUS / DUPLICATE / FAILED); this service adds
 * the human-resolution half around those states WITHOUT a second ingestion or tiling pipeline. Every mutation:
 *   • is gated at the controller by `wsi:reconcile` (a narrow, separately-granted authority);
 *   • is tenant-scoped structurally (the Prisma tenancy extension injects labId into every read/CAS/where);
 *   • is a status-guarded compare-and-set on the existing `status` column — the first operator to flip a row
 *     out of its exception state wins; a concurrent/stale second attempt matches 0 rows → 409, no side effect;
 *   • attributes the decision to the authenticated actor via the persisted reconciledBy/Action/At fields
 *     (the authoritative attribution record; the AuditRecorder event is a best-effort supplementary trail);
 *   • when it ingests, reuses the ACCEPTED 5A pipeline through the composer (server-owned WATCH_FOLDER,
 *     checksum re-verified) and NEVER auto-publishes.
 *
 * RECONCILED means "human-closed WITHOUT ingestion" (dismiss / acknowledge-duplicate) — never processed,
 * READY, published, or viewable. A resolve/retry that actually ingests ends truthfully in INGESTED with the
 * resulting slide/ingestion ids (the reconciliation audit fields are also set); status is never overloaded.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: IngestionDiscoveryService,
    private readonly sources: IngestionSourceService,
    private readonly composer: AutomatedIngestionComposer,
    private readonly audit: AuditRecorder,
  ) {}

  // ── Read surface ──────────────────────────────────────────────────────────────────────────────────────
  /** Tenant-scoped exception queue with server-side filter/sort/pagination + a bounded backlog summary. */
  async queue(query: ReconciliationQueueQueryDto = {}) {
    const status = query.status;
    const statusFilter: Prisma.IngestionDiscoveryWhereInput = status
      ? { status }
      : { status: { in: RECONCILIATION_EXCEPTION_STATES as unknown as ReconciliationExceptionState[] } };
    const q = query.q?.trim();
    const where: Prisma.IngestionDiscoveryWhereInput = {
      ...statusFilter,
      ...(query.sourceId ? { sourceId: query.sourceId } : {}),
      // Contains over the RELATIVE sourceRef only (never a supplied absolute/root path).
      ...(q ? { sourceRef: { contains: q, mode: 'insensitive' as const } } : {}),
    };
    const take = Math.min(Math.max(query.take ?? 50, 1), 200);
    const skip = Math.max(query.skip ?? 0, 0);
    const orderBy = { [query.sortBy ?? 'updatedAt']: query.sortDir ?? 'asc' } as Prisma.IngestionDiscoveryOrderByWithRelationInput;

    const [items, total, grouped] = await Promise.all([
      this.prisma.ingestionDiscovery.findMany({ where, select: QUEUE_SELECT, orderBy, take, skip }),
      this.prisma.ingestionDiscovery.count({ where }),
      this.prisma.ingestionDiscovery.groupBy({
        by: ['status'],
        where: { status: { in: RECONCILIATION_EXCEPTION_STATES as unknown as ReconciliationExceptionState[] } },
        _count: { _all: true },
      }),
    ]);

    const summary: Record<ReconciliationExceptionState, number> = { UNMATCHED: 0, AMBIGUOUS: 0, DUPLICATE: 0, FAILED: 0 };
    for (const g of grouped) if (isExceptionState(g.status)) summary[g.status] = g._count._all;
    return { items, total, take, skip, summary };
  }

  // ── Actions (enumerated; no generic transition) ─────────────────────────────────────────────────────────

  /**
   * UNMATCHED / AMBIGUOUS → operator explicitly selects a same-tenant record, then the accepted handoff runs.
   * AMBIGUOUS selection is constrained to the EXACT persisted candidate set (no fuzzy / patient-name inference).
   * Successful ingestion ends in INGESTED; the reconciliation actor/action/time are persisted on the way.
   */
  async resolveToRecord(id: string, recordId: string, actorId: string) {
    const d = await this.discovery.get(id);
    if (!d) throw new NotFoundException('discovery not found');
    if (d.status !== 'UNMATCHED' && d.status !== 'AMBIGUOUS') {
      throw new ConflictException(`discovery ${id} is not an unresolved match exception (status=${d.status})`);
    }
    if (d.status === 'AMBIGUOUS') {
      const candidates = extractCandidateRecordIds(d.matchEvidence);
      if (!candidates.includes(recordId)) {
        throw new BadRequestException('selected record is not one of the exact ambiguous candidates');
      }
    }
    // Same-tenant existence: the tenancy extension scopes this find to the caller's lab → cross-lab/missing = null.
    const record = await this.prisma.record.findFirst({ where: { id: recordId }, select: { id: true } });
    if (!record) throw new BadRequestException('record not found in this lab');

    // CAS: exception → MATCHED, stamping the operator's decision. Loser of a concurrent race gets count=0.
    const cas = await this.prisma.ingestionDiscovery.updateMany({
      where: { id, status: d.status },
      data: {
        status: 'MATCHED',
        matchedRecordId: recordId,
        reconciledById: actorId,
        reconciliationAction: 'RESOLVE_TO_RECORD',
        reconciledAt: new Date(),
      },
    });
    if (cas.count !== 1) throw new ConflictException('discovery was already reconciled by another operator');

    await this.audit.recordEntityUpdated({
      resource: { type: 'IngestionDiscovery', id, labId: d.labId },
      changedFields: ['status', 'matchedRecordId', 'reconciledById', 'reconciliationAction', 'reconciledAt'],
      producerModule: 'wsi-auto-ingestion',
    });

    return this.ingestFromSource(id, d.sourceId, d.sourceRef, d.sourceChecksum, recordId, d.matchedSpecimenId ?? null);
  }

  /**
   * DUPLICATE → acknowledge/dismiss as a duplicate: RECONCILED, actor/action/time persisted, the B3
   * `duplicateOf` provenance RETAINED for operator context. Creates NO slide and NO ingestion, and never
   * silently re-uses the prior slide as this discovery's clinical object. (Force-reingest is deliberately
   * out of B4 — it is a separate, higher-risk decision.)
   */
  async acknowledgeDuplicate(id: string, actorId: string) {
    const d = await this.discovery.get(id);
    if (!d) throw new NotFoundException('discovery not found');
    if (d.status !== 'DUPLICATE') throw new ConflictException(`discovery ${id} is not a DUPLICATE (status=${d.status})`);

    const cas = await this.prisma.ingestionDiscovery.updateMany({
      where: { id, status: 'DUPLICATE' },
      data: {
        status: 'RECONCILED',
        reconciledById: actorId,
        reconciliationAction: 'ACKNOWLEDGE_DUPLICATE',
        reconciledAt: new Date(),
      },
    });
    if (cas.count !== 1) throw new ConflictException('discovery was already reconciled by another operator');
    // matchEvidence (duplicateOf) intentionally untouched; no slide/ingestion is created.
    await this.audit.recordEntityUpdated({
      resource: { type: 'IngestionDiscovery', id, labId: d.labId },
      changedFields: ['status', 'reconciledById', 'reconciliationAction', 'reconciledAt'],
      producerModule: 'wsi-auto-ingestion',
    });
    return this.discovery.get(id);
  }

  /** Any exception → DISMISS (human-closed, no ingestion): RECONCILED. Optional note kept in matchEvidence. */
  async dismiss(id: string, actorId: string, reason?: string) {
    const d = await this.discovery.get(id);
    if (!d) throw new NotFoundException('discovery not found');
    if (!isExceptionState(d.status)) {
      throw new ConflictException(`discovery ${id} is not an open exception (status=${d.status})`);
    }
    // Preserve any prior evidence (accession / candidates / duplicateOf / failureReason); annotate the dismissal.
    const evidence = mergeEvidence(d.matchEvidence, { dismissal: { reason: reason ?? null } });
    const cas = await this.prisma.ingestionDiscovery.updateMany({
      where: { id, status: { in: RECONCILIATION_EXCEPTION_STATES as unknown as ReconciliationExceptionState[] } },
      data: {
        status: 'RECONCILED',
        reconciledById: actorId,
        reconciliationAction: 'DISMISS',
        reconciledAt: new Date(),
        matchEvidence: evidence,
      },
    });
    if (cas.count !== 1) throw new ConflictException('discovery was already reconciled by another operator');
    await this.audit.recordEntityUpdated({
      resource: { type: 'IngestionDiscovery', id, labId: d.labId },
      changedFields: ['status', 'reconciledById', 'reconciliationAction', 'reconciledAt'],
      producerModule: 'wsi-auto-ingestion',
    });
    return this.discovery.get(id);
  }

  /**
   * FAILED → operator-triggered narrow RETRY. Retryable ONLY when the failure occurred AFTER an authoritative
   * match + checksum were persisted (i.e. a transient hand-off failure): the record + byte identity are known,
   * so retry re-reads the SAME source object under root confinement, re-hashes, re-verifies against the
   * persisted checksum, and reuses the accepted pipeline. A pre-match/pre-checksum failure is NOT retryable
   * from the existing discovery (the file must be re-presented to the source) — dismiss it instead.
   * Idempotent: the status-CAS guard means a second/stale retry after success matches 0 rows → 409, no new slide.
   */
  async retry(id: string, actorId: string) {
    const d = await this.discovery.get(id);
    if (!d) throw new NotFoundException('discovery not found');
    if (d.status !== 'FAILED') throw new ConflictException(`discovery ${id} is not FAILED (status=${d.status})`);
    if (!d.matchedRecordId || !d.sourceChecksum) {
      throw new BadRequestException(
        'this failure is not retryable from the existing discovery (no persisted match/checksum) — dismiss it',
      );
    }
    const cas = await this.prisma.ingestionDiscovery.updateMany({
      where: { id, status: 'FAILED', matchedRecordId: { not: null }, sourceChecksum: { not: null } },
      data: {
        status: 'MATCHED',
        reconciledById: actorId,
        reconciliationAction: 'RETRY',
        reconciledAt: new Date(),
        retryCount: { increment: 1 },
      },
    });
    if (cas.count !== 1) throw new ConflictException('discovery was already retried or resolved by another operator');
    await this.audit.recordEntityUpdated({
      resource: { type: 'IngestionDiscovery', id, labId: d.labId },
      changedFields: ['status', 'reconciledById', 'reconciliationAction', 'reconciledAt', 'retryCount'],
      producerModule: 'wsi-auto-ingestion',
    });
    return this.ingestFromSource(id, d.sourceId, d.sourceRef, d.sourceChecksum, d.matchedRecordId, d.matchedSpecimenId ?? null);
  }

  // ── Shared accepted-pipeline handoff (the ONLY ingestion path) ─────────────────────────────────────────
  private async ingestFromSource(
    id: string,
    sourceId: string,
    sourceRef: string,
    persistedChecksum: string | null,
    recordId: string,
    specimenId: string | null,
  ) {
    const source = await this.sources.get(sourceId);
    if (!source) {
      await this.fail(id, 'RECONCILE_SOURCE_UNAVAILABLE');
      throw new BadRequestException('the discovery source is no longer available');
    }
    // Reconstruct the path from TRUSTED persisted source.rootPath + sourceRef, then re-apply root confinement.
    let absPath: string;
    try {
      absPath = await resolveConfinedPath(source.rootPath, sourceRef);
    } catch (e) {
      await this.fail(id, `RECONCILE_PATH_UNRESOLVABLE: ${(e as Error)?.message ?? 'gone'}`);
      throw new BadRequestException('the source file is missing or escapes the source root');
    }
    let sizeBytes: number;
    let checksum: string;
    try {
      const st = await fs.stat(absPath);
      sizeBytes = st.size;
      checksum = await sha256File(absPath);
    } catch (e) {
      await this.fail(id, `RECONCILE_READ_FAILED: ${(e as Error)?.message ?? 'unreadable'}`);
      throw new BadRequestException('the source file could not be read');
    }
    // A retry/resolve must not ingest CHANGED bytes under the old discovery identity.
    if (persistedChecksum && checksum !== persistedChecksum) {
      await this.fail(id, 'RECONCILE_CHECKSUM_CHANGED');
      throw new ConflictException('source bytes changed since discovery — refusing to ingest under the old identity');
    }
    try {
      const res = await this.composer.ingestMatchedFile({
        absPath,
        filename: sourceRef.split('/').pop() ?? sourceRef,
        sizeBytes,
        recordId,
        specimenId,
        expectedChecksum: checksum,
      });
      // INGESTED only after the accepted service created + verified the slide. Reconciliation fields persist.
      return this.discovery.setStatus(id, 'INGESTED', {
        resultingSlideId: res.slideId,
        resultingIngestionId: res.ingestionId,
        sourceChecksum: checksum,
      });
    } catch (e) {
      await this.fail(id, `RECONCILE_HANDOFF_FAILED: ${(e as Error)?.message ?? 'unknown'}`);
      throw e instanceof BadRequestException || e instanceof ConflictException
        ? e
        : new BadRequestException('ingestion hand-off failed');
    }
  }

  private async fail(id: string, reason: string): Promise<void> {
    const cur = await this.discovery.get(id).catch(() => null);
    // Back to FAILED (retryable again if a match+checksum are present); the reconciliation decision fields stay.
    await this.discovery
      .setStatus(id, 'FAILED', { failureReason: reason, retryCount: (cur?.retryCount ?? 0) + 1 })
      .catch(() => undefined);
  }
}

/** Reconstruct + confine a source path from the TRUSTED persisted root + relative ref (reuses the B2 boundary). */
export async function resolveConfinedPath(rootPath: string, sourceRef: string): Promise<string> {
  const rootReal = await fs.realpath(rootPath);
  const abs = path.join(rootReal, sourceRef);
  const real = await fs.realpath(abs); // resolves symlinks; throws if the file is gone
  if (!isWithinRoot(rootReal, real)) throw new Error('resolved path escapes the source root');
  return real;
}

function extractCandidateRecordIds(evidence: Prisma.JsonValue | null | undefined): string[] {
  if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) {
    const c = (evidence as Record<string, unknown>).candidateRecordIds;
    if (Array.isArray(c)) return c.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

function mergeEvidence(evidence: Prisma.JsonValue | null | undefined, patch: Record<string, unknown>): Prisma.InputJsonValue {
  const base = evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? (evidence as Record<string, unknown>) : {};
  return { ...base, ...patch } as unknown as Prisma.InputJsonValue;
}

/** Re-export for tests that assert byte identity independently of the streamed hasher. */
export function sha256Buffer(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex');
}
