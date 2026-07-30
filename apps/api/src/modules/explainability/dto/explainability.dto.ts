import { ExplainabilityArtifactKind } from '@prisma/client';
import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Generate an explainability artifact set from a completed (SUCCEEDED) inference record (Decision 8 — the only
 * trigger; no automatic/event/scheduled/dataset generation). `config` is structured runtime configuration hashed to
 * an immutable configDigest (deterministic). `kinds` optionally narrows which artifact kinds to produce (default:
 * all four). NO PHI in any field. Eligibility, validation-only inheritance, and atomicity are enforced server-side.
 */
export class GenerateExplainabilityDto {
  @IsString() @MaxLength(64) inferenceRecordId!: string;
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsEnum(ExplainabilityArtifactKind, { each: true })
  kinds?: ExplainabilityArtifactKind[];
  @IsOptional() config?: unknown; // structured runtime config (hashed to configDigest); NO PHI
}
