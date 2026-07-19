import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Program 2 · P2-7C — a narrowly scoped, ASYNC-CONTEXT-LOCAL recursion guard for PHI audit-query
 * read capture. It marks execution only around the capture (recorder) call. A nested PHI-capture that
 * begins while an outer capture is still on the stack (a would-be capture → recorder → query →
 * capture loop) is suppressed; independent/later requests each run in their own async context and
 * capture normally. It holds NO process-global flag, NO static boolean, and NO user-controlled
 * suppression — state lives only in the AsyncLocalStorage store and unwinds on success OR throw.
 *
 * This guards the EXECUTION loop, not content selection: it never suppresses a legitimate later user
 * request just because a returned row happens to be a prior AUDIT_EVENT_PHI_ACCESSED event.
 */
@Injectable()
export class AuditQueryReadCaptureGuard {
  private readonly als = new AsyncLocalStorage<{ capturing: true }>();

  /** True iff the current async execution is already inside a capture (i.e., a nested re-entry). */
  isCapturing(): boolean {
    return this.als.getStore()?.capturing === true;
  }

  /**
   * Run the capture `fn` inside the guarded context. `fn` errors propagate (fail-closed); the guarded
   * flag is cleared automatically when the AsyncLocalStorage scope exits (return or throw).
   */
  runCapture<T>(fn: () => Promise<T>): Promise<T> {
    return this.als.run({ capturing: true }, fn);
  }
}
