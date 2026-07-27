import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { IngestionDiscoveryStatus } from '@prisma/client';

/**
 * Program 5B · B4 — exception & reconciliation contracts.
 *
 * The four intake EXCEPTION states an operator may act on. These are the ONLY states the reconciliation queue
 * lists and the ONLY states an action may transition from — a resolved/ingested/in-flight discovery is never
 * exposed here and never re-reconciled (idempotency is enforced by a status-guarded conditional update).
 */
export const RECONCILIATION_EXCEPTION_STATES = ['UNMATCHED', 'AMBIGUOUS', 'DUPLICATE', 'FAILED'] as const;
export type ReconciliationExceptionState = (typeof RECONCILIATION_EXCEPTION_STATES)[number];

export function isExceptionState(s: IngestionDiscoveryStatus | string): s is ReconciliationExceptionState {
  return (RECONCILIATION_EXCEPTION_STATES as readonly string[]).includes(s);
}

/**
 * The enumerated human reconciliation actions (persisted verbatim in `IngestionDiscovery.reconciliationAction`).
 * There is NO generic/free-form transition — every mutation maps to exactly one of these, per exception type.
 */
export const RECONCILIATION_ACTIONS = ['RESOLVE_TO_RECORD', 'ACKNOWLEDGE_DUPLICATE', 'RETRY', 'DISMISS'] as const;
export type ReconciliationAction = (typeof RECONCILIATION_ACTIONS)[number];

/** Tenant-scoped exception-queue query (server-side filter/sort/pagination). */
export class ReconciliationQueueQueryDto {
  /** Restrict to a single exception state; omitted → all four. */
  @IsOptional()
  @IsIn(RECONCILIATION_EXCEPTION_STATES as unknown as string[])
  status?: ReconciliationExceptionState;

  /** Restrict to one configured source (a source id — never a path). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceId?: string;

  /** Free-text contains over sourceRef / accession evidence (never a filesystem path input). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number = 50;

  /** Sort key (bounded); default oldest-exception-first so the backlog drains fairly. */
  @IsOptional()
  @IsIn(['discoveredAt', 'updatedAt'])
  sortBy?: 'discoveredAt' | 'updatedAt' = 'updatedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'asc';
}

/** UNMATCHED / AMBIGUOUS → explicit operator record selection (same-tenant; AMBIGUOUS constrained to candidates). */
export class ResolveToRecordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  recordId!: string;
}

/** DISMISS (any exception) → RECONCILED without ingestion. Optional short operator note (no PHI/free-form path). */
export class DismissDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
