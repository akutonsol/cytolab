import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Add a Record to a screening batch (Phase 4.2 · C3).
 *
 * Only the case identifier is client-supplied. `labId` is stamped by the tenancy
 * extension from context; `batchId` comes from the route; `disposition` always
 * starts at the schema default (`Pending`); `screenedById`/`screenedAt` are
 * owner-set at disposition time. None of those are accepted here.
 */
export class AddScreeningBatchCaseDto {
  /** The case to enroll. Access is re-checked in the current lab context. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  recordId!: string;
}
