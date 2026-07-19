import { Injectable } from '@nestjs/common';
import { ExecutionContextService } from '../../../common/execution-context/execution-context.service';
import { AuditRecorder } from '../audit-recorder.service';
import { AuditMetadataValue, AuditExportFormat, AuditExportProjection } from '../audit-metadata';
import { AuditQueryService } from './audit-query.service';
import { AuditReaderPrincipal, RequestedAuditScope, ResolvedAuditScope } from './audit-query.types';
import { RawAuditQueryFilters, MAX_PAGE_SIZE } from './audit-query.filters';
import { isSystemReader } from './audit-query.policy';
import { assembleBoundedAuditExport, AuditExportFetchPage } from './audit-export.assembler';
import { serializeAuditExportCsv, serializeAuditExportNdjson } from './audit-export.serializer';
import { deriveExportFilterClass } from './audit-export.filter-class';

/** Server-owned maximum rows per export. The client may request a lower cap but never a higher one. */
export const MAX_AUDIT_EXPORT_ROWS = 10_000;
/** Internal assembly page size (not client-controlled) — the frozen reader's maximum, for efficiency. */
const EXPORT_PAGE_SIZE = MAX_PAGE_SIZE;

export interface AuditExportRequest {
  principal: AuditReaderPrincipal;
  requestedScope?: RequestedAuditScope;
  filters: RawAuditQueryFilters;
  projection: AuditExportProjection;
  format: AuditExportFormat;
  cap?: number;
}

/** The fully-resolved, already-CAPTURED artifact handed to the controller for egress. */
export interface AuditExportArtifact {
  format: AuditExportFormat;
  projection: AuditExportProjection;
  body: string;
  contentType: string;
  filename: string;
  cacheControl: string;
  exportedCount: number;
  truncated: boolean;
}

const CACHE_CONTROL = 'no-store, no-cache, must-revalidate, private';

/**
 * Program 2 · P2-9A — governed audit-log export coordinator. It owns ONLY sequencing:
 *
 *   authorize + assemble (frozen AuditQueryService) → serialize (certified AuditEventView) →
 *   capture DATA_EXPORT:AUDIT_EXPORTED transactionally (fail-closed) → hand a resolved artifact back.
 *
 * It never touches Prisma (the recorder owns the capture transaction), never builds a query, and never
 * opens the HTTP response — no byte can leave before capture commits. Authorization, scope, PHI, and
 * concealment are all inherited from AuditQueryService.list(): the export can only ever contain rows
 * the same principal could read interactively under the same predicate, scope, and projection.
 *
 * GOVERNANCE SEMANTICS (do not extend the metadata to represent transport delivery). AUDIT_EXPORTED
 * records the governed LOGICAL export event — "this authorized export was assembled and prepared for
 * egress" — NOT a guarantee that the client received every transmitted byte. That is deliberate:
 *   - the metadata carries `exportedCount`/`truncated` (facts of the logical dataset) but NO
 *     `exportedBytes`/transport-delivery field, because serialization is deterministic and the event
 *     is about WHAT was authorized to leave, not the exact HTTP payload the socket delivered;
 *   - the capture commits BEFORE egress begins, so by construction it can never observe delivery — a
 *     mid-stream client disconnect after commit does not un-happen the authorized export.
 * Future work must NOT add a byte-count or delivery-confirmation field here; a transport-receipt
 * concern, if ever needed, is a distinct event, not an extension of this one.
 */
@Injectable()
export class AuditExportCoordinator {
  constructor(
    private readonly query: AuditQueryService,
    private readonly recorder: AuditRecorder,
    private readonly executionContext: ExecutionContextService,
  ) {}

  async export(req: AuditExportRequest): Promise<AuditExportArtifact> {
    const phi = req.projection === 'phi';
    const cap = Math.min(req.cap ?? MAX_AUDIT_EXPORT_ROWS, MAX_AUDIT_EXPORT_ROWS);
    const maxPages = Math.ceil(cap / EXPORT_PAGE_SIZE) + 5;

    // Page fetch composed over the FROZEN reader. `list()` asserts audit:read (+ read_system for
    // SYSTEM/CROSS_LAB, + read_phi for PHI) and self-audits each PHI page — authorization/scope/PHI
    // parity and PHI read-capture are inherited, not re-implemented. The pinned window replaces the
    // per-call default so every page shares one snapshot window.
    const fetchPage: AuditExportFetchPage = async ({ cursor, window }) => {
      const filters: RawAuditQueryFilters = {
        ...req.filters,
        ...(window ? { timeFrom: window.timeFrom, timeTo: window.timeTo } : {}),
        pageSize: EXPORT_PAGE_SIZE,
      };
      const page = await this.query.list({
        principal: req.principal,
        requestedScope: req.requestedScope,
        filters,
        cursor,
        phi,
      });
      const scope: ResolvedAuditScope = page.effective.scope;
      return {
        items: page.items,
        nextCursor: page.nextCursor,
        effective: {
          queryScope: scope.kind,
          selectedLabCount: scope.kind === 'CROSS_LAB' ? scope.labIds.length : undefined,
          phi: page.effective.phi,
          timeFrom: page.effective.timeFrom,
          timeTo: page.effective.timeTo,
        },
      };
    };

    // 1. Assemble the complete bounded snapshot IN MEMORY (no response opened).
    const assembly = await assembleBoundedAuditExport(fetchPage, { cap, maxPages });

    // 2. Serialize the certified projection (the ONLY serializer; no export-only model).
    const body =
      req.format === 'csv'
        ? serializeAuditExportCsv(assembly.items, req.projection)
        : serializeAuditExportNdjson(assembly.items);

    // 3. Capture the governed LOGICAL export event with final metadata, transactionally, BEFORE any
    //    egress. This records that the export was authorized + prepared — NOT that the bytes reached the
    //    client (see the class note; no exportedBytes/delivery field, by design). An elevated
    //    (audit:read_system) reader captures SYSTEM-scoped via the P2-6E0 bridge — so a SYSTEM export
    //    fails closed on the R-016 chain exactly like a SYSTEM PHI read; an ordinary LAB reader captures
    //    LAB-scoped. A capture failure PROPAGATES → no artifact is returned → the controller egresses
    //    zero bytes.
    const metadata: AuditMetadataValue = {
      projection: req.projection,
      format: req.format,
      queryScope: assembly.queryScope,
      ...(assembly.selectedLabCount !== undefined ? { selectedLabCount: assembly.selectedLabCount } : {}),
      exportedCount: assembly.exportedCount,
      truncated: assembly.truncated,
      cap,
      filterClass: deriveExportFilterClass(req.filters),
    };
    const emit = () => this.recorder.recordAuditExported(metadata);
    if (isSystemReader(req.principal)) {
      await this.executionContext.runSystemAsCurrentActor(emit);
    } else {
      await emit();
    }

    // 4. Capture has committed — the artifact is safe to egress.
    return {
      format: req.format,
      projection: req.projection,
      body,
      contentType:
        req.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
      filename: `audit-export-${req.projection}.${req.format === 'csv' ? 'csv' : 'ndjson'}`,
      cacheControl: CACHE_CONTROL,
      exportedCount: assembly.exportedCount,
      truncated: assembly.truncated,
    };
  }
}
