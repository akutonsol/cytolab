import { IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';
import { RawAuditQueryFilters } from '../audit-query.filters';
import { RequestedAuditScope } from '../audit-query.types';
import { AuditExportFormat, AuditExportProjection } from '../../audit-metadata';

/**
 * Program 2 · P2-9A — transport DTO for POST /audit/events/export. The predicate is exactly the frozen
 * GET /audit/events contract (the service validators remain authoritative for bounds/window/allow-list)
 * plus governed egress selectors: `format`, `projection`, and an optional `cap` (clamped server-side —
 * a client can never raise it above the server maximum). No free-text/metadata/hash/IP/patient search,
 * no raw predicate, no sort, no offset/page numbers, no cursor (assembly owns iteration). Unknown fields
 * are rejected by the controller's whitelist pipe.
 */
export class ExportAuditEventsBodyDto {
  @IsOptional() @IsISO8601() timeFrom?: string;
  @IsOptional() @IsISO8601() timeTo?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) category?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) actionCode?: string[];

  @IsOptional() @IsString() actorType?: string;
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsString() resourceType?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsString() outcome?: string;
  @IsOptional() @IsString() correlationId?: string;

  // Governed scope selection (translated to the frozen request model; labIds honored only for a
  // system-authorized scope — the service policy is authoritative).
  @IsOptional() @IsIn(['lab', 'system', 'cross_lab']) scope?: 'lab' | 'system' | 'cross_lab';
  @IsOptional() @IsArray() @IsString({ each: true }) labIds?: string[];

  // Governed egress selectors (required — malformed values are rejected).
  @IsIn(['csv', 'ndjson']) format!: AuditExportFormat;
  @IsIn(['base', 'phi']) projection!: AuditExportProjection;

  // Optional client cap; the server clamps to its maximum (client can never exceed it).
  @IsOptional() @IsInt() @Min(1) cap?: number;
}

export interface ParsedAuditExportRequest {
  filters: RawAuditQueryFilters;
  requestedScope?: RequestedAuditScope;
  projection: AuditExportProjection;
  format: AuditExportFormat;
  cap?: number;
}

function mapScope(dto: ExportAuditEventsBodyDto): RequestedAuditScope | undefined {
  if (!dto.scope) return undefined;
  const kind = dto.scope === 'lab' ? 'LAB' : dto.scope === 'system' ? 'SYSTEM' : 'CROSS_LAB';
  const labIds = dto.labIds?.map((s) => s.trim()).filter(Boolean);
  return { scope: kind, labIds: labIds && labIds.length ? labIds : undefined };
}

/** Map the validated transport DTO to the frozen request model. Pure; no service/Prisma coupling. */
export function parseAuditExportRequest(dto: ExportAuditEventsBodyDto): ParsedAuditExportRequest {
  const filters: RawAuditQueryFilters = {
    timeFrom: dto.timeFrom,
    timeTo: dto.timeTo,
    category: dto.category as RawAuditQueryFilters['category'],
    actionCode: dto.actionCode,
    actorType: dto.actorType as RawAuditQueryFilters['actorType'],
    actorId: dto.actorId,
    resourceType: dto.resourceType,
    resourceId: dto.resourceId,
    outcome: dto.outcome as RawAuditQueryFilters['outcome'],
    correlationId: dto.correlationId,
  };
  return { filters, requestedScope: mapScope(dto), projection: dto.projection, format: dto.format, cap: dto.cap };
}
