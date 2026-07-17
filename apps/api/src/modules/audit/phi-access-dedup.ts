import { Injectable } from '@nestjs/common';
import { ExecutionContextService } from '../../common/execution-context/execution-context.service';
import { PHI_ACCESS_SURFACES } from './audit-metadata';

/**
 * Program 2 · P2-5B — request/execution-scoped PHI-access deduplication (inert foundation).
 *
 * Bounds amplification: aggregators + UI polling/prefetch + nested owner calls re-read the same
 * PHI within one request, but each (patient, surface) should be recorded ONCE per request. The
 * dedupe scope is a single seen-set that lives on the current execution's AsyncLocalStorage store
 * (via ExecutionContextService) — so the `executionId` dimension is realized by the set itself,
 * with NO process-global Map, NO shared cache, NO Redis, NO time window, NO cross-request dedupe,
 * NO timer, and NO background cleanup (the set is collected when the request store ends).
 *
 * Nested owner calls share the same store → the same seen-set → the same dedupe scope. A new
 * request opens a new store → a fresh set → re-emits (a genuine new access).
 *
 * P2-5B does NOT wire this into any owner; it is provided internally for P2-5C/D.
 */

export type PhiAccessSurface = (typeof PHI_ACCESS_SURFACES)[number];

/** Deterministic key for single-subject access within one execution. */
export function singleSubjectDedupeKey(patientRef: string, accessSurface: PhiAccessSurface): string {
  return `s|${accessSurface}|${patientRef}`;
}

/** Deterministic key for aggregate (list/search/export) access within one execution. */
export function aggregateDedupeKey(actionCode: string, accessSurface: PhiAccessSurface): string {
  return `a|${actionCode}|${accessSurface}`;
}

/**
 * Pure check-and-mark against a caller-owned seen-set: returns true if the key was newly added
 * (emit) and false if it was already present (skip). Constant-time. Exported so dedupe behavior is
 * unit-testable with an explicit Set, independent of ExecutionContext (a different Set models a
 * different execution).
 */
export function checkAndMark(seen: Set<string>, key: string): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

@Injectable()
export class PhiAccessDedup {
  constructor(private readonly executionContext: ExecutionContextService) {}

  /** First single-subject access to (patientRef, surface) in this execution → true; repeats → false. */
  shouldEmitSingleSubject(input: { patientRef: string; accessSurface: PhiAccessSurface }): boolean {
    return this.mark(singleSubjectDedupeKey(input.patientRef, input.accessSurface));
  }

  /** First aggregate access of (actionCode, surface) in this execution → true; repeats → false. */
  shouldEmitAggregate(input: { actionCode: string; accessSurface: PhiAccessSurface }): boolean {
    return this.mark(aggregateDedupeKey(input.actionCode, input.accessSurface));
  }

  private mark(key: string): boolean {
    const seen = this.executionContext.getPhiAccessSeenSet();
    if (!seen) return true; // no request/execution scope → cannot dedupe → emit (safe default)
    return checkAndMark(seen, key);
  }
}
