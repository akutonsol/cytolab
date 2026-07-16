// Renders the five E2 section states DISTINCTLY, and a count value that never
// fabricates a zero. `error` and `deferred` are visually distinct from `empty`.
import type { EnterpriseCountState, SectionStatus } from '../types';

const STATE_LABEL: Record<SectionStatus, string> = {
  ready: 'Ready',
  empty: 'Empty',
  forbidden: 'Restricted',
  error: 'Unavailable',
  deferred: 'Deferred',
};

// Distinct treatment per state (state-driven, NOT count-driven). Zero-orange safe:
// indigo (ready), slate (empty/forbidden), red (error), dashed slate (deferred).
const STATE_CLASS: Record<SectionStatus, string> = {
  ready: 'bg-[var(--indigo-50)] text-primary',
  empty: 'bg-slate-100 text-slate-500',
  forbidden: 'bg-slate-100 text-slate-600',
  error: 'bg-[var(--status-danger-soft)] text-[var(--status-danger-strong)]',
  deferred: 'border border-dashed border-slate-300 text-slate-500',
};

export function QueueStateTag({ status }: { status: SectionStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_CLASS[status]}`}>
      {STATE_LABEL[status]}
    </span>
  );
}

/** Count: a number only for ready/empty (owner total, may be 0); otherwise an em
 *  dash — never a fabricated zero for deferred/error/forbidden. */
export function CountValue({ count }: { count: EnterpriseCountState }) {
  if (count.status === 'ready' || count.status === 'empty') {
    return <span className="tabular-nums">{count.value ?? 0}</span>;
  }
  return (
    <span className="text-slate-400" title={count.reason}>
      —
    </span>
  );
}
