import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ExecutionContextService } from '../../../common/execution-context/execution-context.service';
import { AuditRecorder } from '../audit-recorder.service';
import { AuditQueryReadCaptureGuard } from './audit-query-read-capture.guard';
import {
  AuditQueryPort,
  AuditQueryListInput,
  AuditQueryGetInput,
} from './audit-query.port';
import { AuditEventPage, AuditEventView, AuditEventPhiView, ResolvedAuditScope, AuditReaderPrincipal } from './audit-query.types';
import { resolveAuditQueryScope, resolveAuditPhiAccess, resolveAuditDetailVisibility, isSystemReader } from './audit-query.policy';
import { validateAuditQueryFilters, NormalizedAuditQueryFilters } from './audit-query.filters';
import { decodeAuditCursor, encodeAuditCursor, AuditQueryCursor } from './audit-query.cursor';
import { projectAuditEvent, projectAuditEventPhi, RawAuditEventRow } from './audit-query.projection';

/**
 * Program 2 · P2-7B — the governed, READ-ONLY production reader of the audit ledger. This is the
 * ONLY sanctioned non-verifier read owner of the stored audit events. It owns scope resolution,
 * filter/cursor validation, PHI authorization, and safe projection; it NEVER trusts the controller to
 * have pre-approved anything. It exposes list/getById only — no mutation surface, no recorder use.
 *
 * TERMINOLOGY (query scope vs stored organizationScope):
 *   - LAB query scope       → rows with organizationScope='LAB' AND scopeLabId = the reader's lab.
 *   - SYSTEM query scope     → rows with organizationScope IN ('SYSTEM','CROSS_LAB') — platform
 *                              governance rows (scopeLabId is null). NOT "all LAB rows".
 *   - CROSS_LAB query scope → a bounded selection of LAB rows across explicit labIds
 *                              (organizationScope='LAB' AND scopeLabId IN labIds). NOT stored
 *                              organizationScope='CROSS_LAB' rows.
 *
 * PHI NOTE (P2-7C): the PHI projection is policy-enforced here, but AUDITING the act of reading PHI
 * audit events (recursion-safe read-access capture) is deferred to P2-7C — this service intentionally
 * emits no audit event (the recorder is deliberately not used here).
 */

/** Only fields the projection/scope/filter/cursor need are ever selected — hashes/chain/PII/raw are never fetched. */
const BASE_SELECT = {
  id: true,
  occurredAt: true,
  recordedAt: true,
  schemaVersion: true,
  eventVersion: true,
  category: true,
  severity: true,
  phiIndicator: true,
  dataClass: true,
  actorType: true,
  actorId: true,
  organizationScope: true,
  scopeLabId: true,
  organizationId: true,
  requestId: true,
  correlationId: true,
  sessionId: true,
  resourceType: true,
  resourceId: true,
  actionCode: true,
  outcome: true,
  producerModule: true,
  metadata: true,
} as const;

@Injectable()
export class AuditQueryService implements AuditQueryPort {
  constructor(
    private readonly prisma: PrismaService,
    // P2-7C — fail-closed PHI read-access capture (recorder + SYSTEM bridge + recursion guard).
    private readonly recorder: AuditRecorder,
    private readonly executionContext: ExecutionContextService,
    private readonly captureGuard: AuditQueryReadCaptureGuard,
  ) {}

  /** Overridable seam for deterministic tests; not caller-influenced. */
  protected now(): Date {
    return new Date();
  }

  // --- Prisma predicate builders (owner-side only; controllers never build these) ----------------

  private scopeWhere(scope: ResolvedAuditScope): Prisma.AuditEventWhereInput {
    switch (scope.kind) {
      case 'LAB':
        return { organizationScope: 'LAB', scopeLabId: scope.labId };
      case 'SYSTEM':
        return { organizationScope: { in: ['SYSTEM', 'CROSS_LAB'] } };
      case 'CROSS_LAB':
        return { organizationScope: 'LAB', scopeLabId: { in: [...scope.labIds] } };
    }
  }

  private filterWhere(f: NormalizedAuditQueryFilters): Prisma.AuditEventWhereInput {
    return {
      recordedAt: { gte: f.timeFrom, lte: f.timeTo },
      ...(f.category ? { category: { in: f.category as any } } : {}),
      ...(f.actionCode ? { actionCode: { in: f.actionCode } } : {}),
      ...(f.actorType ? { actorType: f.actorType as any } : {}),
      ...(f.actorId ? { actorId: f.actorId } : {}),
      ...(f.resourceType ? { resourceType: f.resourceType } : {}),
      ...(f.resourceId ? { resourceId: f.resourceId } : {}),
      ...(f.outcome ? { outcome: f.outcome as any } : {}),
      ...(f.correlationId ? { correlationId: f.correlationId } : {}),
    };
  }

  /** Keyset continuation under the fixed (recordedAt DESC, id DESC) order. */
  private cursorWhere(cursor: AuditQueryCursor | null): Prisma.AuditEventWhereInput {
    if (!cursor) return {};
    return {
      OR: [
        { recordedAt: { lt: cursor.recordedAt } },
        { recordedAt: cursor.recordedAt, id: { lt: cursor.id } },
      ],
    };
  }

  // --- Public read boundary ----------------------------------------------------------------------

  async list(input: AuditQueryListInput): Promise<AuditEventPage<AuditEventView | AuditEventPhiView>> {
    const scope = resolveAuditQueryScope(input.principal, input.requestedScope); // asserts audit:read + scope
    const phi = resolveAuditPhiAccess(input.principal, input.phi ?? false); // asserts audit:read_phi when requested
    const filters = validateAuditQueryFilters(input.filters ?? {}, this.now());
    const cursor = decodeAuditCursor(input.cursor);

    const where: Prisma.AuditEventWhereInput = {
      AND: [this.scopeWhere(scope), this.filterWhere(filters), this.cursorWhere(cursor)],
    };

    const rows = (await this.prisma.auditEvent.findMany({
      where,
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      take: filters.pageSize + 1,
      select: { ...BASE_SELECT, ...(phi ? { patientRef: true } : {}) },
    })) as unknown as RawAuditEventRow[];

    const hasMore = rows.length > filters.pageSize;
    const pageRows = hasMore ? rows.slice(0, filters.pageSize) : rows;
    const items = pageRows.map((r) => (phi ? projectAuditEventPhi(r) : projectAuditEvent(r)));

    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last ? encodeAuditCursor({ recordedAt: last.recordedAt, id: last.id }) : null;

    // P2-7C — fail-closed capture of a successful PHI list read. Emitted AFTER selection/projection,
    // BEFORE release: one event per request, truthful resultCount (0 still emits). Base reads emit
    // nothing. A capture failure PROPAGATES → the PHI page is not released.
    if (phi) {
      await this.capturePhiAccess(input.principal, {
        accessMode: 'list',
        queryScope: scope.kind,
        resultCount: items.length,
        selectedLabCount: scope.kind === 'CROSS_LAB' ? scope.labIds.length : undefined,
        pageSize: filters.pageSize,
        hasMore: nextCursor !== null,
        resource: { type: 'AuditEventCollection', id: 'audit-events' },
      });
    }

    return {
      items,
      nextCursor,
      effective: { scope, timeFrom: filters.timeFrom, timeTo: filters.timeTo, pageSize: filters.pageSize, phi },
    };
  }

  async getById(input: AuditQueryGetInput): Promise<AuditEventView | AuditEventPhiView | null> {
    const visibility = resolveAuditDetailVisibility(input.principal); // asserts audit:read
    const phi = resolveAuditPhiAccess(input.principal, input.phi ?? false);

    // Scope is applied IN the predicate — an inaccessible event is indistinguishable from a missing one.
    const scopeWhere: Prisma.AuditEventWhereInput = visibility.kind === 'ALL' ? {} : this.scopeWhere(visibility);
    const row = (await this.prisma.auditEvent.findFirst({
      where: { AND: [{ id: input.id }, scopeWhere] },
      select: { ...BASE_SELECT, ...(phi ? { patientRef: true } : {}) },
    })) as unknown as RawAuditEventRow | null;

    if (!row) return null; // not-found === out-of-scope (existence never revealed); no capture
    const view = phi ? projectAuditEventPhi(row) : projectAuditEvent(row);

    // P2-7C — fail-closed capture of a successful PHI detail read (one event; resultCount = 1;
    // resource = the accessed AuditEvent). Base reads and null/out-of-scope reads emit nothing.
    if (phi) {
      await this.capturePhiAccess(input.principal, {
        accessMode: 'detail',
        queryScope: visibility.kind === 'ALL' ? 'SYSTEM' : 'LAB',
        resultCount: 1,
        resource: { type: 'AuditEvent', id: row.id },
      });
    }
    return view;
  }

  // --- P2-7C capture ------------------------------------------------------------------------------

  /**
   * Emit exactly ONE fail-closed PHI read-access event for the current request. Ordinary own-lab
   * readers capture as LAB (normal enrichment). Any SYSTEM-authorized (elevated) reader — SYSTEM/
   * CROSS_LAB scope, or an explicit LAB selection made under audit:read_system — captures as SYSTEM
   * via the frozen P2-6E0 bridge, which preserves actor/request/session/correlation while overriding
   * only organization scope. The recursion guard suppresses a nested capture (execution loop); it
   * never suppresses a legitimate later request. Errors propagate so the PHI response fails closed.
   */
  private async capturePhiAccess(
    principal: AuditReaderPrincipal,
    input: {
      accessMode: 'list' | 'detail';
      queryScope: 'LAB' | 'SYSTEM' | 'CROSS_LAB';
      resultCount: number;
      selectedLabCount?: number;
      pageSize?: number;
      hasMore?: boolean;
      resource: { type: string; id: string };
    },
  ): Promise<void> {
    if (this.captureGuard.isCapturing()) return; // nested execution loop — suppress (never user-facing)
    const emit = () => this.captureGuard.runCapture(() => this.recorder.recordAuditEventPhiAccessed(input));
    // Elevated authority (holds audit:read_system) → SYSTEM-scoped envelope; ordinary LAB reader → LAB.
    if (isSystemReader(principal)) {
      await this.executionContext.runSystemAsCurrentActor(emit);
    } else {
      await emit();
    }
  }
}
