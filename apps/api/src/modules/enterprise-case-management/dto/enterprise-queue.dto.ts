import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ENTERPRISE_MAX_PAGE_SIZE } from '../enterprise-case-management.types';

/**
 * Phase 5 · E2A — queue-detail query contract.
 *
 * E2A VALIDATES and RETAINS these fields; it does NOT apply them (composition is
 * deferred). `formType` and `urgent` are intentionally OMITTED for now — adding
 * them would falsely imply active filtering the aggregate does not yet perform.
 * They are deferred to the detail-composition checkpoint.
 */
export class EnterpriseQueueDetailQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ENTERPRISE_MAX_PAGE_SIZE)
  @Type(() => Number)
  pageSize?: number = 50;

  @IsOptional()
  @IsString()
  assignedToId?: string;
}
