// Renders the five E2 section states DISTINCTLY with TEXT (never colour alone),
// and a count value that never fabricates a zero. `error`/`deferred`/`forbidden`
// are visually and textually distinct from `empty`. Zero-orange: indigo/slate/red.
import type { EnterpriseCountState, SectionStatus } from '../types';

const STATE_LABEL: Record<SectionStatus, string> = {
  ready: 'Ready',
  empty: 'Empty',
  forbidden: 'Restricted',
  error: 'Unavailable',
  deferred: 'Deferred',
};

// State-driven treatment (NOT count-driven). No amber/orange.
const STATE_CLASS: Record<SectionStatus, string> = {
  ready: 'bg-[var(--indigo-50)] text-primary',
  empty: 'bg-slate-100 text-slate-600',
  forbidden: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300',
  error: 'bg-[var(--status-danger-soft)] text-[var(--status-danger-strong)]',
  deferred: 'border border-dashed border-slate-300 text-slate-500',
};

export function QueueStateTag({ status }: { status: SectionStatus }) {
  return (
    <span
      className={`inline-flex select-none items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${STATE_CLASS[status]}`}
    >
      {STATE_LABEL[status]}
    </span>
  );
}

/** Count: a real number only for ready/empty (owner total, may legitimately be 0);
 *  otherwise an em dash — never a fabricated zero for deferred/error/forbidden. */
export function CountValue({ count }: { count: EnterpriseCountState }) {
  if (count.status === 'ready' || count.status === 'empty') {
    return <span className="tabular-nums">{count.value ?? 0}</span>;
  }
  return (
    <span className="text-slate-400" title={count.reason} aria-label="No count available">
      —
    </span>
  );
}
