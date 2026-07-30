import { EvaluationCohort } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Initiate a MANUAL continuous-evaluation window (Decision 3 — the only trigger; no worker/scheduler). Binds a model
 * version to an explicit time window + cohort, aggregating its eligible InferenceRecord stream into immutable
 * evidence. An optional 6F ValidationRun baseline (same model version) enables drift/calibration-decay. `config`
 * (e.g. { failureRateThreshold }) is captured as immutable digests. NO PHI. 6G never mutates model lifecycle.
 */
export class RunEvaluationDto {
  @IsString() @MaxLength(64) modelVersionId!: string;
  @IsISO8601() windowStart!: string;
  @IsISO8601() windowEnd!: string;
  @IsEnum(EvaluationCohort) cohort!: EvaluationCohort;
  @IsOptional() @IsString() @MaxLength(64) baselineValidationRunId?: string;
  @IsOptional() @IsString() @MaxLength(32) timeBasis?: string; // canonical time basis; default "UTC"
  @IsOptional() config?: unknown; // structured evaluation config (e.g. thresholds); hashed to digests; NO PHI
}
