import { AncillaryStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Owner-controlled status transition (Phase 4.1A · B3).
 *
 * `status` is the TARGET state; transition legality is enforced by the owner
 * service against an explicit, reviewable transition map (never inferred from
 * enum ordering). An illegal or same-state transition is rejected explicitly.
 * `notes` is optional recorded metadata attached at the transition (e.g. a
 * cancellation reason); no other field is mutable via this endpoint.
 */
export class UpdateAncillaryStatusDto {
  @IsEnum(AncillaryStatus)
  status!: AncillaryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
