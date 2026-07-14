import { AncillaryKind } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Client-authorable fields for placing an ancillary/IHC order (Phase 4.1A · B3).
 *
 * The server owns ALL authority and provenance fields — `id`, `labId`,
 * `orderedById`, `status`, and every timestamp are set by the owner service and
 * are intentionally NOT accepted here. `status` always starts at the schema
 * default (`Ordered`); a client cannot request an initial non-default state.
 */
export class CreateAncillaryOrderDto {
  /** The case this order belongs to. Access is re-checked in the current lab context. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  recordId!: string;

  @IsEnum(AncillaryKind)
  kind!: AncillaryKind;

  /** Real entered marker/antibody/stain name — never inferred. */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  target!: string;

  /** Recorded metadata only in B3 (sign-out enforcement is B4). Defaults true. */
  @IsOptional()
  @IsBoolean()
  blocksSignOut?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
