import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Dispatch a manual inference (Decision 6 — the only trigger; no automatic/event/scheduled execution). The input is
 * referenced by digest, never copied: supply an opaque `inputRef` (hashed to inputDigest) and/or a precomputed
 * `inputDigest`; `config` is structured runtime configuration hashed to an immutable configDigest (Guardrail 1).
 * NO PHI in any field. The lab, model-version eligibility, and idempotency are enforced server-side.
 */
export class DispatchInferenceDto {
  @IsString() @MaxLength(64) modelVersionId!: string;
  @IsOptional() @IsString() @MaxLength(64) subjectSlideId?: string; // reference by id only — no PHI
  @IsOptional() @IsString() @MaxLength(2048) inputRef?: string; // opaque reference — hashed to inputDigest; no PHI
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) inputDigest?: string; // precomputed sha256, if the caller has it
  @IsOptional() config?: unknown; // structured runtime config (hashed to configDigest); NO PHI
}
