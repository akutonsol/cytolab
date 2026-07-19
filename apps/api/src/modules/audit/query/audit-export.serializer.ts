/**
 * Program 2 · P2-9A — the ONLY audit-export serializer. It renders the CERTIFIED AuditEventView /
 * AuditEventPhiView projection into CSV or NDJSON and NOTHING ELSE: it has no access to Prisma rows,
 * raw metadata rows, internal entities, concealed fields, or any alternate projection. The UI and the
 * export are two renderers of the same certified model.
 *
 * Projection immutability is enforced two ways:
 *   - NDJSON — each line is JSON.stringify(view); the parsed object is structurally the wire DTO.
 *   - CSV    — columns are the EXPLICIT certified leaf-field manifest below (tested against the DTO
 *              shape), in a frozen order; no extra column, none omitted, none synthesized.
 *
 * `metadata` is a dynamic-keyed BOUNDED scalar map (its keys vary per event/version), so it cannot be
 * a fixed set of columns. It is rendered as ONE `metadata` column carrying canonical (sorted-key) JSON
 * of that bounded scalar map — a faithful, inspectable, deterministic representation of certified data,
 * NOT an opaque blob and NOT export-only information. NDJSON keeps it as the native object.
 */
import { AuditEventView, AuditEventPhiView } from './audit-query.types';
import { AuditExportProjection } from '../audit-metadata';

export type ExportableAuditEvent = AuditEventView | AuditEventPhiView;

/** One certified leaf field → one CSV column. `get` returns the pre-escape cell string. */
interface CsvColumn {
  column: string;
  get: (v: ExportableAuditEvent) => string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));
const orEmpty = (v: string | null | undefined): string => (v ?? '');

/** Canonical (sorted-key) JSON of the bounded scalar metadata map; '' when the map is null. */
function canonicalMetadata(m: Record<string, string | number | boolean | null> | null): string {
  if (m === null) return '';
  const sorted: Record<string, string | number | boolean | null> = {};
  for (const k of Object.keys(m).sort()) sorted[k] = m[k];
  return JSON.stringify(sorted);
}

/**
 * The frozen certified leaf-field manifest (base projection). Order is part of the contract. Each
 * entry maps 1:1 to a leaf of AuditEventView — no non-certified field appears here.
 */
export const AUDIT_EXPORT_CSV_BASE_COLUMNS: readonly CsvColumn[] = [
  { column: 'id', get: (v) => v.id },
  { column: 'occurredAt', get: (v) => iso(v.occurredAt) },
  { column: 'recordedAt', get: (v) => iso(v.recordedAt) },
  { column: 'schemaVersion', get: (v) => String(v.schemaVersion) },
  { column: 'eventVersion', get: (v) => String(v.eventVersion) },
  { column: 'category', get: (v) => v.category },
  { column: 'actionCode', get: (v) => v.actionCode },
  { column: 'severity', get: (v) => v.severity },
  { column: 'dataClass', get: (v) => v.dataClass },
  { column: 'phiIndicator', get: (v) => String(v.phiIndicator) },
  { column: 'outcome', get: (v) => v.outcome },
  { column: 'actor.type', get: (v) => v.actor.type },
  { column: 'actor.id', get: (v) => orEmpty(v.actor.id) },
  { column: 'organization.scope', get: (v) => v.organization.scope },
  { column: 'organization.labId', get: (v) => orEmpty(v.organization.labId) },
  { column: 'organization.organizationId', get: (v) => orEmpty(v.organization.organizationId) },
  { column: 'resource.type', get: (v) => v.resource.type },
  { column: 'resource.id', get: (v) => orEmpty(v.resource.id) },
  { column: 'request.requestId', get: (v) => orEmpty(v.request.requestId) },
  { column: 'session.sessionId', get: (v) => orEmpty(v.session.sessionId) },
  { column: 'correlationId', get: (v) => orEmpty(v.correlationId) },
  { column: 'producerModule', get: (v) => v.producerModule },
  { column: 'metadataStatus', get: (v) => v.metadataStatus },
  { column: 'metadata', get: (v) => canonicalMetadata(v.metadata) },
];

/** The PHI projection appends exactly one certified leaf — patientRef — and only when projection=phi. */
export const AUDIT_EXPORT_CSV_PHI_COLUMN: CsvColumn = {
  column: 'patientRef',
  get: (v) => orEmpty((v as AuditEventPhiView).patientRef),
};

export function auditExportCsvColumns(projection: AuditExportProjection): readonly CsvColumn[] {
  return projection === 'phi'
    ? [...AUDIT_EXPORT_CSV_BASE_COLUMNS, AUDIT_EXPORT_CSV_PHI_COLUMN]
    : AUDIT_EXPORT_CSV_BASE_COLUMNS;
}

// --- CSV encoding (RFC-4180 + spreadsheet formula-injection defense) ------------------------------

const NEEDS_QUOTING = /[",\r\n]/;
// A cell whose value begins with one of these is treated as a formula by spreadsheet apps.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Neutralize formula injection, then RFC-4180 quote/escape. Deterministic for any input. */
function encodeCsvCell(raw: string): string {
  let cell = raw;
  if (FORMULA_LEAD.test(cell)) cell = `'${cell}`; // prefix so the value is inert text, never a formula
  if (NEEDS_QUOTING.test(cell) || cell !== raw) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

const CRLF = '\r\n';

export function serializeAuditExportCsv(
  items: readonly ExportableAuditEvent[],
  projection: AuditExportProjection,
): string {
  const columns = auditExportCsvColumns(projection);
  const header = columns.map((c) => encodeCsvCell(c.column)).join(',');
  const rows = items.map((it) => columns.map((c) => encodeCsvCell(c.get(it))).join(','));
  return [header, ...rows].join(CRLF) + CRLF;
}

// --- NDJSON ---------------------------------------------------------------------------------------

/**
 * One JSON object per line (LF-separated, trailing newline). Because the input is the certified DTO,
 * each parsed line is structurally identical to the wire projection — Dates serialize to ISO strings
 * exactly as the HTTP API already serializes them.
 */
export function serializeAuditExportNdjson(items: readonly ExportableAuditEvent[]): string {
  if (items.length === 0) return '';
  return items.map((it) => JSON.stringify(it)).join('\n') + '\n';
}
