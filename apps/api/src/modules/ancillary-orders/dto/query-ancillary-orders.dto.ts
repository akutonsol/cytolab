import { AncillaryKind, AncillaryStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Filters for the lab ancillary-order queue (Phase 4.1A · B3). Read-only,
 * lab-scoped by the tenancy extension. Only the plan-approved filters are
 * supported — no speculative search or joins. The queue is defined as OPEN
 * orders (`Ordered`/`InProcess`); a `status` filter narrows within OPEN and can
 * never widen it to a closed state.
 */
export class QueryAncillaryOrdersDto {
  @IsOptional()
  @IsEnum(AncillaryStatus)
  status?: AncillaryStatus;

  @IsOptional()
  @IsEnum(AncillaryKind)
  kind?: AncillaryKind;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  recordId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  blocksSignOut?: boolean;
}
