import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Run a validation (Decision 10 — manual, the only trigger). Binds a FROZEN dataset version (the immutable reference
 * corpus + ground truth) to a VALIDATION/APPROVED model version; the service enforces eligibility, snapshots identity
 * (Guardrails 1/2), and records immutable structured metrics. `config` is the validation configuration, captured as
 * immutable digests (Guardrail 5). NO PHI in any field. Validation never promotes or mutates the model lifecycle.
 */
export class RunValidationDto {
  @IsString() @MaxLength(64) modelVersionId!: string;
  @IsString() @MaxLength(64) datasetVersionId!: string;
  @IsOptional() config?: unknown; // structured validation config (thresholds/metrics/computation); hashed to digests; NO PHI
}
