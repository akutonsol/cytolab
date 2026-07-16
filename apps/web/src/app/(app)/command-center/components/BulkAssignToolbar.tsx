'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { notify } from '@/lib/notify';
import type { WorkloadUser } from '@/lib/workload';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

/**
 * Bulk assignment / unassignment toolbar (E4C). PURE DELEGATION to the owner batch
 * route `PATCH /records/bulk-assign` with the existing `BulkAssignDto`
 * `{ recordIds, assignedToId }` — one atomic owner call, never a client loop over
 * the single-record route. Operates only on the page-scoped ids the caller passes
 * (never reconstructs owner queue membership). The picker offers a deliberate
 * **Unassign** action (submits `assignedToId: null`) alongside each assignee; the
 * empty placeholder is not an action (Apply is disabled until a real choice is made).
 * Success reports the OWNER count verbatim ("N of M assigned" / "N of M unassigned")
 * — no per-record outcome is fabricated, no optimistic UI. On success it refetches
 * the three aggregate caches and clears selection; on failure it surfaces the error
 * and preserves selection for retry. Gated by the caller (`record:change` + `CASE_ASSIGNMENT`).
 */
const UNASSIGN = '__unassign__'; // sentinel — never collides with a cuid user id

export function BulkAssignToolbar({
  selectedIds,
  assignees,
  onClear,
  onAssigned,
  onPendingChange,
}: {
  selectedIds: string[];
  assignees: WorkloadUser[];
  onClear: () => void;
  onAssigned: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const qc = useQueryClient();
  const [action, setAction] = useState(''); // '' placeholder · UNASSIGN · a user id
  const isUnassign = action === UNASSIGN;
  const canSubmit = action !== '';

  const mut = useMutation({
    mutationFn: (assignedToId: string | null) =>
      api.patch('/records/bulk-assign', { recordIds: selectedIds, assignedToId }).then((r) => r.data),
    onSuccess: (data: { assigned?: number }, assignedToId) => {
      const n = data?.assigned ?? 0; // owner-reported count only — never a fabricated per-record outcome
      notify.success(`${n} of ${selectedIds.length} ${assignedToId === null ? 'unassigned' : 'assigned'}`);
      qc.invalidateQueries({ queryKey: ['enterprise-summary'] });
      qc.invalidateQueries({ queryKey: ['enterprise-queues'] });
      qc.invalidateQueries({ queryKey: ['enterprise-queue'] });
      setAction('');
      onAssigned();
    },
    onError: () => notify.error('Bulk update failed'),
  });

  // Report in-flight state up so the panel can lock row/header/single-assign controls.
  useEffect(() => {
    onPendingChange(mut.isPending);
  }, [mut.isPending, onPendingChange]);

  return (
    <div
      role="region"
      aria-label="Bulk assignment"
      className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-[var(--indigo-50)] px-3 py-2"
    >
      <span className="text-sm font-semibold text-primary tabular-nums" aria-live="polite">
        {selectedIds.length} selected
      </span>
      <select
        aria-label="Bulk action for selected records"
        value={action}
        disabled={mut.isPending}
        onChange={(e) => setAction(e.target.value)}
        className={`rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50 ${focusRing}`}
      >
        <option value="">Select action…</option>
        <option value={UNASSIGN}>Unassign</option>
        {assignees.map((u) => (
          <option key={u.userId} value={u.userId}>{u.userName}</option>
        ))}
      </select>
      <Button
        variant="primary"
        size="sm"
        loading={mut.isPending}
        disabled={!canSubmit || selectedIds.length === 0}
        onClick={() => mut.mutate(isUnassign ? null : action)}
      >
        {isUnassign ? 'Unassign' : 'Assign'}
      </Button>
      <Button variant="ghost" size="sm" disabled={mut.isPending} onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
