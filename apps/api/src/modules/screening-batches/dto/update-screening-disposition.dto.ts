import { ScreeningDisposition } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Record a membership's screening disposition (Phase 4.2 · C3).
 *
 * Only forward, non-Pending dispositions are accepted — a client can never reset
 * a case back to `Pending` (the plan does not permit reset). `screenedById` and
 * `screenedAt` are owner-set from the authenticated principal and server clock.
 * `notes` is optional case-level workflow metadata; NO diagnosis, result, or
 * report content may be stored. `QCSelected` means selected for QC only — never
 * that QC was performed or passed; `Flagged` is not a diagnosis; `Screened` is
 * not an authorization.
 */
const RECORDABLE: ScreeningDisposition[] = ['Screened', 'Flagged', 'QCSelected'];

export class UpdateScreeningDispositionDto {
  @IsIn(RECORDABLE)
  disposition!: Exclude<ScreeningDisposition, 'Pending'>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
