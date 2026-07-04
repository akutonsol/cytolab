// Shared TAT-priority derivation for case assignment / workload balancing.
// A record's priority is a 4-level bucket driven by its urgent flag and how much
// of the lab's turnaround-time budget has elapsed.

export type TatPriority = 'Stat' | 'Urgent' | 'Priority' | 'Routine';

export const TAT_PRIORITY_RANK: Record<TatPriority, number> = {
  Stat: 3, Urgent: 2, Priority: 1, Routine: 0,
};

/** Whole hours elapsed since `from` (clamped ≥ 0; 0 when `from` is missing). */
export function hoursElapsed(from: Date | string | null | undefined, now = Date.now()): number {
  if (!from) return 0;
  return Math.max(0, Math.round((now - new Date(from).getTime()) / 3_600_000));
}

/**
 * Derive a record's TAT priority:
 *  - Stat     — urgent AND past the TAT deadline
 *  - Urgent   — flagged urgent (not yet overdue)
 *  - Priority — routine but overdue, or ≥75% of the budget elapsed
 *  - Routine  — everything else
 */
export function tatPriority(opts: {
  urgent: boolean;
  startedAt: Date | string | null | undefined;
  thresholdHours: number;
  now?: number;
}): TatPriority {
  const elapsed = hoursElapsed(opts.startedAt, opts.now);
  const breached = opts.thresholdHours > 0 && elapsed >= opts.thresholdHours;
  if (opts.urgent && breached) return 'Stat';
  if (opts.urgent) return 'Urgent';
  if (breached) return 'Priority';
  if (opts.thresholdHours > 0 && elapsed >= opts.thresholdHours * 0.75) return 'Priority';
  return 'Routine';
}
