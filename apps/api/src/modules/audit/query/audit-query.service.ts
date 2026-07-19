import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  AuditQueryPort,
  AuditQueryListInput,
  AuditQueryGetInput,
} from './audit-query.port';
import { AuditEventPage, AuditEventView, AuditEventPhiView, ResolvedAuditScope } from './audit-query.types';
import { resolveAuditQueryScope, resolveAuditPhiAccess, resolveAuditDetailVisibility } from './audit-query.policy';
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
  constructor(private readonly prisma: PrismaService) {}

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

    if (!row) return null; // not-found === out-of-scope (existence never revealed)
    return phi ? projectAuditEventPhi(row) : projectAuditEvent(row);
  }
}
