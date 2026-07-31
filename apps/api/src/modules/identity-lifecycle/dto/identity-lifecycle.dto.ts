import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Program 7 · Phase 7B.1 — a lifecycle administrative action. `reason` is a bounded, non-PHI, non-secret note recorded
 * on the durable lifecycle event + best-effort audit. No password, token, or external claim is ever accepted here.
 */
export class LifecycleActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
