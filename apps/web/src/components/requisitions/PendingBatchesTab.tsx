'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Play, CheckCircle2, XCircle, DollarSign } from 'lucide-react';
import { api } from '@/lib/api';

interface Batch {
  id: string;
  batchNumber: string;
  submittedAt: string | null;
  totalForms: number;
  totalAmountCents: number;
  status: string;
  paymentMethod: string | null;
  paymentStatus: string;
  _count?: { forms: number };
}

// Zero-orange: PENDING_PAYMENT uses slate (never amber).
const BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  PENDING_PAYMENT: 'bg-slate-200 text-slate-700',
  PAID: 'bg-blue-100 text-blue-700',
  SUBMITTED: 'bg-indigo-100 text-indigo-700',
  PROCESSING: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};
const money = (c: number) => `J$${(c / 100).toLocaleString()}`;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

export function PendingBatchesTab({ can }: { can: (p: string) => boolean }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('SUBMITTED');

  const { data, isLoading } = useQuery({
    queryKey: ['internal-batches', status],
    queryFn: () =>
      api.get('/portal/internal/batches', { params: { status, pageSize: 50 } }).then((r) => r.data as { data: Batch[] }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['internal-batches'] });
  const act = useMutation({
    mutationFn: (v: { id: string; action: string; body?: unknown }) =>
      api.patch(`/portal/internal/batches/${v.id}/${v.action}`, v.body ?? {}),
    onSuccess: invalidate,
  });

  const canAct = can('requisition:create');
  const batches = data?.data ?? [];

  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        {['SUBMITTED', 'PROCESSING', 'COMPLETED', 'REJECTED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              status === s ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
              <th className="px-5 py-3 font-semibold">Batch</th>
              <th className="px-5 py-3 font-semibold">Submitted</th>
              <th className="px-5 py-3 font-semibold">Forms</th>
              <th className="px-5 py-3 font-semibold">Amount</th>
              <th className="px-5 py-3 font-semibold">Payment</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
            {!isLoading && batches.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                  <Inbox size={26} className="mx-auto mb-2 text-slate-300" />
                  No {status.toLowerCase().replace('_', ' ')} batches.
                </td>
              </tr>
            )}
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-5 py-4 font-semibold text-slate-900">{b.batchNumber}</td>
                <td className="px-5 py-4 text-slate-500">{fmt(b.submittedAt)}</td>
                <td className="px-5 py-4 text-slate-700">{b.totalForms}</td>
                <td className="px-5 py-4 text-slate-700">{money(b.totalAmountCents)}</td>
                <td className="px-5 py-4">
                  <span className="text-xs text-slate-600">{b.paymentMethod ?? '—'}</span>
                  <span className={`ml-1.5 text-xs font-semibold ${b.paymentStatus === 'PAID' ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {b.paymentStatus}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${BADGE[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {b.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    {canAct && b.paymentStatus !== 'PAID' && b.paymentMethod !== 'CARD' && (
                      <button onClick={() => act.mutate({ id: b.id, action: 'payment/confirm' })} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <DollarSign size={12} /> Confirm Payment
                      </button>
                    )}
                    {canAct && b.status === 'SUBMITTED' && (
                      <button onClick={() => act.mutate({ id: b.id, action: 'process' })} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                        <Play size={12} /> Process
                      </button>
                    )}
                    {canAct && b.status === 'PROCESSING' && (
                      <button onClick={() => act.mutate({ id: b.id, action: 'complete' })} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                        <CheckCircle2 size={12} /> Complete
                      </button>
                    )}
                    {canAct && ['SUBMITTED', 'PROCESSING'].includes(b.status) && (
                      <button
                        onClick={() => {
                          const reason = window.prompt('Reason for rejecting this batch?');
                          if (reason) act.mutate({ id: b.id, action: 'reject', body: { reason } });
                        }}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50"
                      >
                        <XCircle size={12} /> Reject
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
