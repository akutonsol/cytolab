'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Program 2 · P2-8B — keyset pager (no page numbers, no total). Prev is enabled only when the client
 * cursor stack is non-empty; Next only when the server returned a nextCursor. Announced for SR users.
 */
export function AuditCursorPager({
  count,
  canPrev,
  canNext,
  loading,
  onPrev,
  onNext,
}: {
  count: number;
  canPrev: boolean;
  canNext: boolean;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <nav className="flex items-center justify-between gap-3 pt-3" aria-label="Audit results pagination">
      <span className="text-xs text-slate-500" role="status" aria-live="polite">
        {loading ? 'Loading…' : `${count} event${count === 1 ? '' : 's'} on this page`}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" icon={<ChevronLeft size={15} />} disabled={!canPrev || loading} onClick={onPrev} aria-label="Previous page">
          Previous
        </Button>
        <Button size="sm" variant="outline" disabled={!canNext || loading} onClick={onNext} aria-label="Next page">
          Next
          <ChevronRight size={15} className="ml-1" />
        </Button>
      </div>
    </nav>
  );
}
