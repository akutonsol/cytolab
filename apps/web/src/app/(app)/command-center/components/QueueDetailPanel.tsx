'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Inbox, Lock } from 'lucide-react';
import { Button, EmptyState, SkeletonRows, Td, Th, Tr } from '@/components/ui';
import { api } from '@/lib/api';
import { notify } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import type { WorkloadUser } from '@/lib/workload';
import { getEnterpriseQueueDetail } from '../enterprise-api';
import type { EnterpriseRecordProjectionRow } from '../types';
import { BulkAssignToolbar } from './BulkAssignToolbar';

const checkboxClass = 'h-4 w-4 rounded border-slate-300 accent-[var(--indigo-500)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

/** Shown (native confirm) before a page/queue change that would discard a non-empty
 *  page-scoped selection. OK = Continue (clear + navigate); Cancel = Stay. */
export const DISCARD_SELECTION_MESSAGE = 'You have selected records. Continuing will clear the current selection.';

const PAGE_SIZE = 50; // matches the E2 default; the owner enforces the max (100)

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

/**
 * Row-level single-assignment control (E4B). PURE DELEGATION to the owner route
 * `PATCH /records/:id/assign` with the owner DTO `{ assignedToId }` — no bulk, no
 * optimistic update, no local persistence/validation/authorization. On success it
 * refreshes the aggregate views (membership + counts change). Assignees come from
 * the existing `/workload/summary` read; visibility is gated by the caller
 * (`record:change` + `CASE_ASSIGNMENT`). Empty selection = unassign (`null`).
 */
function AssignSelect({ record, assignees, disabled }: { record: EnterpriseRecordProjectionRow; assignees: WorkloadUser[]; disabled?: boolean }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (assignedToId: string | null) =>
      api.patch(`/records/${record.id}/assign`, { assignedToId }).then((r) => r.data),
    onSuccess: (_data, assignedToId) => {
      notify.success(assignedToId ? 'Case assigned' : 'Case unassigned');
      // Assignment changes queue membership + counts — refetch the aggregate surfaces.
      qc.invalidateQueries({ queryKey: ['enterprise-summary'] });
      qc.invalidateQueries({ queryKey: ['enterprise-queues'] });
      qc.invalidateQueries({ queryKey: ['enterprise-queue'] });
    },
    onError: () => notify.error('Assignment failed'),
  });
  return (
    <select
      aria-label={`Assign ${record.identifier ?? record.labNumber ?? 'record'}`}
      value={record.assignedToId ?? ''}
      disabled={disabled || mut.isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => mut.mutate(e.target.value || null)}
      className={`w-full max-w-[180px] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50 ${focusRing}`}
    >
      <option value="">Unassigned</option>
      {assignees.map((u) => (
        <option key={u.userId} value={u.userId}>{u.userName}</option>
      ))}
    </select>
  );
}

/** Tri-state "select all on this page" checkbox (indeterminate = some, not all). */
function HeaderCheckbox({ checked, indeterminate, disabled, onChange }: { checked: boolean; indeterminate: boolean; disabled?: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all records on this page"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className={checkboxClass}
    />
  );
}

/** Mobile record card — the same allowlisted fields as the table row; the whole
 *  card is a keyboard-focusable link that navigates via ownerPath. When the caller
 *  may assign, a delegation control is rendered as a sibling (never nested in the link). */
function RecordCard({ r, canAssign, assignees, selected, onToggle, bulkPending }: { r: EnterpriseRecordProjectionRow; canAssign: boolean; assignees: WorkloadUser[]; selected: boolean; onToggle: () => void; bulkPending: boolean }) {
  return (
    <li>
      <Link
        href={r.ownerPath}
        className={`block rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50 ${focusRing}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-slate-900">{r.patientDisplayName ?? '—'}</span>
          {r.urgent && (
            <span className="shrink-0 rounded-full bg-[var(--status-danger-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--status-danger-strong)]">
              Urgent
            </span>
          )}
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
          <div className="truncate"><dt className="inline text-slate-400">ID </dt><dd className="inline">{r.identifier ?? '—'}</dd></div>
          <div className="truncate"><dt className="inline text-slate-400">Lab# </dt><dd className="inline">{r.labNumber ?? '—'}</dd></div>
          <div className="truncate"><dt className="inline text-slate-400">Form </dt><dd className="inline">{r.formType ?? '—'}</dd></div>
          <div className="truncate"><dt className="inline text-slate-400">Status </dt><dd className="inline">{r.status}</dd></div>
          <div className="truncate"><dt className="inline text-slate-400">Assigned </dt><dd className="inline">{r.assignedToName ?? '—'}</dd></div>
          <div className="truncate"><dt className="inline text-slate-400">Created </dt><dd className="inline">{fmtDate(r.createdAt)}</dd></div>
          <div className="truncate"><dt className="inline text-slate-400">Changed </dt><dd className="inline">{fmtDate(r.statusChangedAt)}</dd></div>
        </dl>
      </Link>
      {canAssign && (
        <div className="mt-2 flex items-center gap-2 pl-1">
          <input
            type="checkbox"
            aria-label={`Select ${r.identifier ?? r.labNumber ?? 'record'}`}
            checked={selected}
            disabled={bulkPending}
            onChange={onToggle}
            className={checkboxClass}
          />
          <span className="text-xs text-slate-400">Assign</span>
          <AssignSelect record={r} assignees={assignees} disabled={bulkPending} />
        </div>
      )}
    </li>
  );
}

/**
 * Detail panel — GET /enterprise/queues/:queue for the selected queue. Renders
 * ONLY the allowlisted row fields; owner pagination/ordering used verbatim (no
 * local sort/filter/paginate/recount). Table at `md+`, record cards below. Row
 * navigation via ownerPath only, keyboard-accessible through a real link (no
 * arbitrary tabindex). Five section states render distinctly; error/forbidden/
 * deferred are never shown as empty. Independent loading / failure boundary.
 */
export function QueueDetailPanel({ queue, onSelectionCountChange }: { queue: string | null; onSelectionCountChange?: (n: number) => void }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1); // reset to page 1 when the selected queue changes
  }, [queue]);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['enterprise-queue', queue, page],
    queryFn: () => getEnterpriseQueueDetail(queue as string, page, PAGE_SIZE),
    enabled: !!queue,
  });

  // E4B — single-assignment delegation. Gated by the app's established assignment
  // convention (record:change + CASE_ASSIGNMENT); assignees reuse /workload/summary.
  const { can } = useAuth();
  const { isEnabled } = useFeatures();
  const canAssign = can('record:change') && isEnabled('CASE_ASSIGNMENT');
  const { data: assignees = [] } = useQuery<WorkloadUser[]>({
    queryKey: ['workload-summary'],
    enabled: canAssign,
    queryFn: () => api.get('/workload/summary').then((r) => r.data),
  });

  // E4C — page-scoped bulk selection (CURRENT PAGE ONLY; never reconstructs owner
  // queue membership). `bulkPending` locks all assignment controls while an owner
  // bulk mutation is in flight. Selection is discarded only via confirmed navigation
  // (page change here; queue change guarded by the parent) — never silently.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  useEffect(() => {
    setSelected(new Set()); // queue changed — the parent already confirmed any discard
  }, [queue]);
  useEffect(() => {
    onSelectionCountChange?.(selected.size); // let the parent guard queue changes
  }, [selected, onSelectionCountChange]);
  const clearSelection = () => setSelected(new Set());
  // Guard a page change: if a selection exists, confirm before discarding it.
  const requestPageChange = (next: number) => {
    if (selected.size > 0 && !window.confirm(DISCARD_SELECTION_MESSAGE)) return;
    setSelected(new Set());
    setPage(next);
  };

  if (!queue) {
    return <EmptyState icon={<Inbox size={28} />} title="Select a queue" description="Choose a queue from the rail to view its records." />;
  }
  if (isLoading) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading records…</span>
        <SkeletonRows rows={8} columns={canAssign ? 10 : 9} />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <EmptyState
        tone="danger"
        icon={<AlertTriangle size={28} />}
        title="This queue could not be loaded."
        action={<Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>}
      />
    );
  }

  const section = data.section;
  if (section.status === 'forbidden') {
    return <EmptyState icon={<Lock size={28} />} title="Restricted" description="You do not have access to this queue." />;
  }
  if (section.status === 'error') {
    return (
      <EmptyState
        tone="danger"
        icon={<AlertTriangle size={28} />}
        title="This queue could not be loaded."
        description={section.reason}
        action={<Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>}
      />
    );
  }
  if (section.status === 'deferred') {
    return <EmptyState icon={<Clock size={28} />} title="Not available" description={section.reason ?? 'This queue is deferred.'} />;
  }
  if (section.status === 'empty' || !section.data || section.data.items.length === 0) {
    return <EmptyState icon={<Inbox size={28} />} title="No records" description="This queue has no records." />;
  }

  const d = section.data;
  const pageIds = d.items.map((r) => r.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = pageIds.some((id) => selected.has(id));
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(() => (allSelected ? new Set() : new Set(pageIds)));

  return (
    <div>
      {canAssign && selected.size > 0 && (
        <BulkAssignToolbar
          selectedIds={Array.from(selected)}
          assignees={assignees}
          onClear={clearSelection}
          onAssigned={clearSelection}
          onPendingChange={setBulkPending}
        />
      )}
      {/* Table — md and up */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full">
          <thead>
            <tr>
              {canAssign && (
                <Th scope="col">
                  <HeaderCheckbox checked={allSelected} indeterminate={someSelected && !allSelected} disabled={bulkPending} onChange={toggleAll} />
                </Th>
              )}
              <Th scope="col">Patient</Th>
              <Th scope="col">Identifier</Th>
              <Th scope="col">Lab #</Th>
              <Th scope="col">Form</Th>
              <Th scope="col">Status</Th>
              <Th scope="col">Urgent</Th>
              <Th scope="col">Assigned</Th>
              <Th scope="col">Created</Th>
              <Th scope="col">Status changed</Th>
            </tr>
          </thead>
          <tbody>
            {d.items.map((r, i) => (
              <Tr key={r.id} interactive index={i} onClick={() => router.push(r.ownerPath)}>
                {canAssign && (
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.identifier ?? r.labNumber ?? 'record'}`}
                      checked={selected.has(r.id)}
                      disabled={bulkPending}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleRow(r.id)}
                      className={checkboxClass}
                    />
                  </Td>
                )}
                <Td>
                  <Link href={r.ownerPath} onClick={(e) => e.stopPropagation()} className={`rounded font-medium text-slate-900 hover:text-primary ${focusRing}`}>
                    {r.patientDisplayName ?? '—'}
                  </Link>
                </Td>
                <Td>{r.identifier ?? '—'}</Td>
                <Td>{r.labNumber ?? '—'}</Td>
                <Td>{r.formType ?? '—'}</Td>
                <Td>{r.status}</Td>
                <Td>{r.urgent ? 'Urgent' : '—'}</Td>
                <Td>{canAssign ? <AssignSelect record={r} assignees={assignees} disabled={bulkPending} /> : (r.assignedToName ?? '—')}</Td>
                <Td nowrap>{fmtDate(r.createdAt)}</Td>
                <Td nowrap>{fmtDate(r.statusChangedAt)}</Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Record cards — below md */}
      <ul className="space-y-2 md:hidden">
        {d.items.map((r) => (
          <RecordCard key={r.id} r={r} canAssign={canAssign} assignees={assignees} selected={selected.has(r.id)} onToggle={() => toggleRow(r.id)} bulkPending={bulkPending} />
        ))}
      </ul>

      {/* Pagination — owner values verbatim */}
      <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-500">
        <span className="tabular-nums" aria-live="polite">
          {d.total} record{d.total === 1 ? '' : 's'} · page {d.page} of {d.totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<ChevronLeft size={14} />}
            aria-label="Previous page"
            disabled={d.page <= 1 || isFetching}
            onClick={() => requestPageChange(Math.max(1, page - 1))}
          >
            Prev
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Next page"
            disabled={d.page >= d.totalPages || isFetching}
            onClick={() => requestPageChange(page + 1)}
          >
            Next
            <ChevronRight size={14} className="ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
