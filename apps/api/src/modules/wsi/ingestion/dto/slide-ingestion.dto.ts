import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

/** Source kinds a client may declare at intake. Downstream ingestion sources (watch-folder, scanner,
 *  DICOM) arrive in Programs 5B/5C; P5-3A is manual UPLOAD. */
const INGESTION_SOURCE_KINDS = ['UPLOAD'] as const;

export class InitiateSlideUploadDto {
  /** Optional specimen anchor (must belong to the same record + tenant — enforced in the service). */
  @IsOptional()
  @IsString()
  specimenId?: string;

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsIn(INGESTION_SOURCE_KINDS)
  sourceKind?: (typeof INGESTION_SOURCE_KINDS)[number];
}

export class CompleteSlideUploadDto {
  /** Optional client-declared sha256 (lowercase hex). If present it is verified against the persisted
   *  bytes BEFORE the ingestion may transition to VERIFIED; a mismatch fails the ingestion. */
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/, { message: 'expectedChecksum must be a lowercase 64-char sha256 hex' })
  expectedChecksum?: string;
}
