import { ClinicalPerfCohort } from '@prisma/client';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Initiate a MANUAL clinical-performance measurement window (Decision 2 — the only trigger; no worker/scheduler).
 * Binds a model version to an explicit time window + cohort, aggregating its 6C inference + 6E human-review evidence
 * into immutable MEASUREMENTS. An optional 6F ValidationRun baseline (same model version) may be referenced.
 * `operationalDataUsed` opts into reading reference-only Program-5 coded operational metadata (identifiers/timestamps/
 * status only — NEVER narrative/findings/PHI). `config` is captured as immutable digests. NO PHI. 6H makes no
 * clinical/diagnostic claim and never mutates a diagnosis, sign-out, or lifecycle.
 */
export class RunClinicalPerfDto {
  @IsString() @MaxLength(64) modelVersionId!: string;
  @IsISO8601() windowStart!: string;
  @IsISO8601() windowEnd!: string;
  @IsEnum(ClinicalPerfCohort) cohort!: ClinicalPerfCohort;
  @IsOptional() @IsString() @MaxLength(64) baselineValidationRunId?: string;
  @IsOptional() @IsString() @MaxLength(32) timeBasis?: string; // canonical time basis; default "UTC"
  @IsOptional() @IsBoolean() operationalDataUsed?: boolean; // opt-in to reference-only Program-5 coded operational metadata
  @IsOptional() config?: unknown; // structured measurement config; hashed to a digest; NO PHI
}
