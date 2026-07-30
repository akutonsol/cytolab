import { DatasetKind, DatasetPurpose, DatasetSlideMembership } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Create a governed dataset. `key` is the stable slug; `kind` fixes VALIDATION vs TRAINING_REFERENCE. */
export class CreateDatasetDto {
  @IsString() @Matches(SLUG) key!: string;
  @IsString() @MaxLength(160) displayName!: string;
  @IsEnum(DatasetKind) kind!: DatasetKind;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

/** Mutable descriptive metadata only — never key, kind, or datasetUuid. */
export class UpdateDatasetDto {
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

/** Create a DRAFT version. `purpose` is immutable provenance (NOT authorization). inclusionRules = structured, no PHI. */
export class CreateDatasetVersionDto {
  @IsEnum(DatasetPurpose) purpose!: DatasetPurpose;
  @IsOptional() inclusionRules?: unknown; // structured JSON; slide/technical attributes only — NO PHI
}

/** Add a slide to a DRAFT version's membership — reference by id ONLY; no PHI copied. */
export class AddDatasetSlideDto {
  @IsString() @MaxLength(64) slideId!: string;
  @IsOptional() @IsString() @MaxLength(64) specimenId?: string;
  @IsOptional() @IsEnum(DatasetSlideMembership) membership?: DatasetSlideMembership; // default INCLUDED
  @IsOptional() @IsString() @MaxLength(200) exclusionReason?: string; // coded reason — NO PHI
}

/** Set/replace a structured ground-truth label on a DRAFT version. Values are coded — NO free-text PHI. */
export class SetGroundTruthLabelDto {
  @IsString() @MaxLength(64) slideId!: string;
  @IsString() @MaxLength(64) labelSchemaKey!: string;
  @IsString() @MaxLength(32) labelSchemaVersion!: string;
  @IsString() @MaxLength(256) labelValue!: string; // coded/structured — NO PHI
}

/** Add a pointer-only reference to an EXTERNAL training corpus (TRAINING_REFERENCE datasets). No bytes, no PHI. */
export class AddTrainingReferenceDto {
  @IsString() @MaxLength(500) descriptor!: string;
  @IsString() @MaxLength(2048) provenanceUri!: string;
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) contentDigest?: string;
}
