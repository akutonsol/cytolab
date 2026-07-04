'use client';

import { useState } from 'react';
import { AlertCircle, Plus, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import { RequisitionFormDrawer } from '@/components/RequisitionFormDrawer';
import { STAGE_META, type TrackingCard } from '@/lib/req-tracking';

interface RequisitionLine { id: string; isCompleted: boolean }
interface Requisition {
  id: string;
  referenceNo?: string | null;
  status: string;
  amount: number; // cents
  client?: { firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null } | null;
  dateReceived?: string | null;
  lines: RequisitionLine[];
  _count?: { lines: number };
  createdAt: string;
}

// Status → detector-safe badge classes.
const STATUS_BADGE: Record<string, string> = {
  Pending: 'bg-surface-container text-secondary',
  Active: 'bg-primary-fixed text-primary',
  Partial: 'bg-[#FEF3C7] text-[#92400E]',
  Completed: 'bg-status-sage/10 text-status-sage',
  Disabled: 'bg-surface-container text-secondary',
};

const BADGE = 'inline-flex items-center rounded-full px-3 py-1 font-label-sm text-label-sm';
const TH = 'px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider whitespace-nowrap';
const CELL = 'px-4 py-3 font-body-sm text-body-sm text-on-surface align-top';
const money = (cents?: number) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

export default function RequisitionsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { isEnabled } = useFeatures();
  const showTracking = isEnabled('REQUISITION_TRACKING');

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['requisitions', page, pageSize],
    queryFn: () =>
      api.get<Paginated<Requisition>>('/requisitions', { params: { page, pageSize } }).then((r) => r.data),
  });

  const { data: tracking } = useQuery<TrackingCard[]>({
    queryKey: ['req-tracking-list', ''],
    queryFn: () => api.get('/req-tracking').then((r) => r.data),
    enabled: showTracking && can('requisition:view'),
  });
  const stageByReq = new Map((tracking ?? []).map((t) => [t.requisitionId, t.currentStage]));

  const errorMessage =
    (error as any)?.code === 'ECONNABORTED'
      ? 'The request timed out. Please try again.'
      : (error as any)?.response?.data?.message ?? 'Could not load requisitions. Please try again.';

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-charcoal-heading">Requisitions</h2>
          <p className="font-body-sm text-body-sm text-secondary">Track client orders and fulfilment.</p>
        </div>
        {can('requisition:create') && (
          <button className="btn-primary" onClick={() => setDrawerOpen(true)}><Plus size={16} /> New Requisition</button>
        )}
      </div>

      <div className="glass-card rounded-2xl p-6">
        {isError && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-error/20 bg-error-container p-4">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-error" />
            <div className="flex-1">
              <div className="font-label-md text-label-md text-error">Failed to load</div>
              <div className="font-body-sm text-body-sm text-on-error-container">{errorMessage}</div>
              <button className="btn-secondary mt-3" onClick={() => refetch()}><RotateCcw size={14} /> Retry</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className={TH}>Ref#</th>
                <th className={TH}>Client</th>
                <th className={TH}>Ordered</th>
                <th className={TH}>Fulfilled</th>
                <th className={TH}>Amount</th>
                <th className={TH}>Status</th>
                {showTracking && <th className={TH}>Tracking</th>}
                <th className={TH}>Received</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && !isError && rows.length === 0 && (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-outline-variant/10">
                    <td colSpan={showTracking ? 8 : 7} className="px-4 py-3"><div className="h-5 w-full animate-pulse rounded-md bg-surface-container" /></td>
                  </tr>
                ))
              )}
              {!isFetching && rows.length === 0 && !isError && (
                <tr><td colSpan={showTracking ? 8 : 7} className="px-4 py-10 text-center font-body-sm text-body-sm text-secondary">No requisitions found.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-outline-variant/10 transition-colors hover:bg-surface-container-low/60">
                  <td className={CELL}>{r.referenceNo ?? '—'}</td>
                  <td className={CELL}>
                    {r.client ? (
                      <div>
                        <div>{r.client.officeName || `${r.client.firstName} ${r.client.lastName}`}</div>
                        {r.client.accountNo && <div className="font-body-sm text-body-sm text-secondary">AC# {r.client.accountNo}</div>}
                      </div>
                    ) : '—'}
                  </td>
                  <td className={CELL}>{r._count?.lines ?? r.lines?.length ?? 0}</td>
                  <td className={CELL}>{(r.lines ?? []).filter((l) => l.isCompleted).length}</td>
                  <td className={CELL}>{money(r.amount)}</td>
                  <td className={CELL}><span className={`${BADGE} ${STATUS_BADGE[r.status] ?? 'bg-surface-container text-secondary'}`}>{r.status.toUpperCase()}</span></td>
                  {showTracking && (
                    <td className={CELL}>
                      {stageByReq.has(r.id)
                        ? <span className={BADGE} style={{ background: STAGE_META[stageByReq.get(r.id)!].bg, color: STAGE_META[stageByReq.get(r.id)!].fg }}>{STAGE_META[stageByReq.get(r.id)!].label}</span>
                        : <span className="text-secondary">—</span>}
                    </td>
                  )}
                  <td className={`${CELL} whitespace-nowrap`}>{r.dateReceived ? new Date(r.dateReceived).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="font-body-sm text-body-sm text-secondary">{total} total</div>
          <div className="flex items-center gap-3">
            <select
              className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              {[10, 20, 50, 100].map((s) => <option key={s} value={s}>{s} / page</option>)}
            </select>
            <div className="flex items-center gap-2">
              <button className="btn-secondary" disabled={page <= 1} style={{ opacity: page <= 1 ? 0.5 : 1 }} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
              <span className="font-body-sm text-body-sm text-secondary">Page {page} / {totalPages}</span>
              <button className="btn-secondary" disabled={page >= totalPages} style={{ opacity: page >= totalPages ? 0.5 : 1 }} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
        </div>
      </div>

      <RequisitionFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
