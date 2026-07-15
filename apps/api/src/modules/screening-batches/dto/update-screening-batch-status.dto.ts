import { ScreeningBatchStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

/**
 * Owner-controlled lifecycle transition (Phase 4.2 · C3).
 *
 * `status` is the TARGET state; transition legality is enforced by the owner
 * service against an explicit, reviewable transition map (never inferred from
 * enum ordering). An illegal or same-state transition is rejected explicitly.
 * No other field is mutable via this endpoint — no notes, no timestamps, no
 * generic PATCH surface. Entry-state timestamps (assignedAt/startedAt/
 * completedAt/closedAt) are set by the owner, never by the client.
 */
export class UpdateScreeningBatchStatusDto {
  @IsEnum(ScreeningBatchStatus)
  status!: ScreeningBatchStatus;
}
