import { IsBooleanString, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * P2-7B — transport DTO for GET /audit/events. Coarse validation only; the frozen P2-7A validators
 * (filters/cursor) + the service policy remain authoritative. Array filters arrive comma-separated
 * (split by the controller). The caller never supplies labId/permissions/superuser — those come from
 * the trusted authenticated principal; `labIds` is honored only for a system-authorized `scope`.
 */
export class ListAuditEventsQueryDto {
  @IsOptional() @IsISO8601() timeFrom?: string;
  @IsOptional() @IsISO8601() timeTo?: string;

  // Comma-separated multi-value filters (bounds enforced by the service validator).
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() actionCode?: string;

  @IsOptional() @IsString() actorType?: string;
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsString() resourceType?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsString() outcome?: string;
  @IsOptional() @IsString() correlationId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsString() cursor?: string;

  // Governed scope selection (translated to the frozen request model by the controller).
  @IsOptional() @IsIn(['lab', 'system', 'cross_lab']) scope?: 'lab' | 'system' | 'cross_lab';
  @IsOptional() @IsString() labIds?: string; // comma-separated; only honored for system-authorized scope

  @IsOptional() @IsBooleanString() includePhi?: string; // 'true' | 'false'
}

export class GetAuditEventQueryDto {
  @IsOptional() @IsBooleanString() includePhi?: string;
}
