import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Batch → screener assignment (Phase 4.2 · C3). Screening-batch ownership only:
 * recording `assignedToId` here NEVER touches Record.assignedTo, workload /
 * pathologist assignment, Sign-Out ownership, or employee schedules.
 *
 * The client supplies only the intended screener id. The acting manager
 * (`assignedById`) and `assignedAt` are derived by the owner from the
 * authenticated principal and server clock — never accepted from the request.
 * Semantic validation that `assignedToId` is a real lab user is deferred (see
 * the service note): the owner boundary limits cross-owner reads to Record, so
 * this checkpoint records the scalar id without a User lookup.
 */
export class AssignScreeningBatchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  assignedToId!: string;
}
