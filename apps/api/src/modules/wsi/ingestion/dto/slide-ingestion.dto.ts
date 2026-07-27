import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import type { SlideSourceKind } from '@prisma/client';

/** PUBLIC whitelist a *client* may declare at intake — UPLOAD only. The `@IsIn` below keeps this the
 *  authoritative public boundary: a browser request declaring any other kind (e.g. WATCH_FOLDER) is
 *  rejected. Automated ingestion (Program 5B) sets its source kind SERVER-SIDE via an in-process call,
 *  bypassing this DTO/ValidationPipe — so the whitelist is deliberately NOT widened. Scanner/DICOM are 5C. */
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

  // TYPE is the full server-side enum (so an in-process automated caller can set WATCH_FOLDER); the runtime
  // @IsIn keeps the PUBLIC whitelist at UPLOAD only — the validator, not the type, is the public boundary.
  @IsOptional()
  @IsIn(INGESTION_SOURCE_KINDS)
  sourceKind?: SlideSourceKind;
}

export class CompleteSlideUploadDto {
  /** Optional client-declared sha256 (lowercase hex). If present it is verified against the persisted
   *  bytes BEFORE the ingestion may transition to VERIFIED; a mismatch fails the ingestion. */
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/, { message: 'expectedChecksum must be a lowercase 64-char sha256 hex' })
  expectedChecksum?: string;
}
