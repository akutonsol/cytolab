import { HumanReviewDecisionType, HumanReviewRequestState } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Open a review workflow over a completed inference (Decision 10 — manual, human-initiated). */
export class CreateReviewRequestDto {
  @IsString() @MaxLength(64) inferenceRecordId!: string;
}

/** Assign a reviewer (workflow routing only — grants no clinical authority). */
export class AssignReviewDto {
  @IsString() @MaxLength(64) assigneeUserId!: string;
}

/** A structured, coded MODIFY finding (Decision 6) — NO PHI, NO narrative, NO diagnosis field. */
export class ModifiedFindingDto {
  @IsString() @MaxLength(64) findingCode!: string;
  @IsOptional() @IsString() @MaxLength(64) valueCode?: string;
  @IsOptional() @IsNumber() valueNum?: number;
}

/**
 * Submit a human ACCEPT/REJECT/MODIFY decision. The reviewer identity is taken from the AUTHENTICATED principal by
 * the controller — it is NOT part of this DTO and a client-supplied reviewer id is never accepted (Decision 3).
 * `modifiedFindings` is only valid for MODIFY; `reviewRationale` is a short bounded note (never a report/PHI).
 */
export class SubmitReviewDecisionDto {
  @IsEnum(HumanReviewDecisionType) reviewDecision!: HumanReviewDecisionType;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ModifiedFindingDto)
  modifiedFindings?: ModifiedFindingDto[];
  @IsOptional() @IsString() @MaxLength(2000) reviewRationale?: string; // SHORT rationale only — no report narrative, no PHI
  @IsOptional() @IsString() @MaxLength(64) explainabilityGenerationId?: string; // must belong to the SAME record (Guardrail 2)
}

/** Governed reopen of a completed/cancelled request (administrative workflow — Guardrail 3). */
export class ReopenReviewDto {
  @IsOptional() @IsIn(['PENDING', 'ASSIGNED'] satisfies HumanReviewRequestState[]) toState?: HumanReviewRequestState;
}
