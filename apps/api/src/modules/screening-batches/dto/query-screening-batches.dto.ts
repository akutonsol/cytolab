import { ScreeningBatchStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Filters for the screening-batch list / queue reads (Phase 4.2 · C3).
 * Read-only, lab-scoped by the tenancy extension. Only the plan-approved filters
 * are supported — no speculative search, joins, dashboards, or analytics.
 *
 * On the queue (open batches), a `status` filter narrows within the non-terminal
 * set and can never widen it to Closed/Cancelled. `batchNumber` is an exact,
 * lab-scoped match.
 */
export class QueryScreeningBatchesDto {
  @IsOptional()
  @IsEnum(ScreeningBatchStatus)
  status?: ScreeningBatchStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedToId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  batchNumber?: string;
}
