'use client';
import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Eye, Download, Check, ChevronDown } from 'lucide-react';
import { portalApi } from '@/lib/portal-api';
import { fmtDate } from '@/lib/portal-ui';

// 4-step lifecycle derived from batch status → done | active | pending.
function batchTimeline(status: string, createdAt: string) {
  const past = ['SUBMITTED', 'PAID', 'PROCESSING', 'COMPLETED'].includes(status);
  const done = (ok: boolean): 'done' | 'pending' => (ok ? 'done' : 'pending');
  return [
    { label: 'Created', date: fmtDate(createdAt), status: 'done' as const },
    { label: 'Submitted', date: past ? fmtDate(createdAt) : 'Pending', status: done(past) },
    { label: 'Processing', date: status === 'PROCESSING' ? 'In progress' : status === 'COMPLETED' ? 'Done' : 'Pending', status: (status === 'PROCESSING' ? 'active' : done(status === 'COMPLETED')) as 'done' | 'active' | 'pending' },
    { label: 'Completed', date: status === 'COMPLETED' ? 'Done' : 'Pending', status: done(status === 'COMPLETED') },
  ];
}

interface BatchRow {
  id: string;
  batchNumber: string;
  createdAt: string;
  totalForms: number;
  totalAmountCents: number;
  status: string;
  paymentStatus: string;
}

// Zero-orange: PENDING_PAYMENT uses slate (never amber).
const BATCH_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  PENDING_PAYMENT: 'bg-slate-200 text-slate-700',
  PAID: 'bg-blue-100 text-blue-700',
  SUBMITTED: 'bg-indigo-100 text-indigo-700',
  PROCESSING: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const money = (cents: number) => `J$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

async function downloadManifest(id: string, batchNumber: string) {
  const res = await portalApi.get(`/portal/batches/${id}/manifest`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${batchNumber}-manifest.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PortalRequisitionsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: batches, isLoading } = useQuery({
    queryKey: ['portal-batches'],
    queryFn: () => portalApi.get('/portal/batches').then((r) => r.data as BatchRow[]),
  });

  const create = useMutation({
    mutationFn: () => portalApi.post('/portal/batches', {}).then((r) => r.data as BatchRow),
    onSuccess: (batch) => {
      qc.invalidateQueries({ queryKey: ['portal-batches'] });
      router.push(`/portal/requisitions/${batch.id}`);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-[#0F172A]">Requisitions</h1>
          <p className="text-sm text-gray-500">Submit batches of cytology requisitions to the lab.</p>
        </div>
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300"
        >
          <Plus size={16} /> {create.isPending ? 'Creating…' : 'New Batch'}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#EEF2F7] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#EEF2F7] text-left text-xs uppercase tracking-wider text-gray-400">
              <th className="px-5 py-3 font-semibold">Batch</th>
              <th className="px-5 py-3 font-semibold">Created</th>
              <th className="px-5 py-3 font-semibold">Forms</th>
              <th className="px-5 py-3 font-semibold">Total</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && (batches?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-10 py-16">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <ClipboardList size={40} className="text-[#CBD5E1]" />
                    <div className="mt-2 text-[18px] font-semibold text-[#0a0b1a]">No requisitions yet</div>
                    <div className="text-[14px] text-[#64748b]">Submit your first batch of cytology specimens.</div>
                    <button onClick={() => create.mutate()} disabled={create.isPending}
                      className="mt-4 rounded-[10px] bg-[#4F46E5] px-6 py-3 text-[14px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
                      + New Requisition
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {batches?.map((b) => {
              const open = expanded === b.id;
              return (
              <Fragment key={b.id}>
                <tr onClick={() => setExpanded(open ? null : b.id)}
                  className="cursor-pointer border-b border-[#F1F4F7] last:border-0 hover:bg-[#F8FAFC]">
                  <td className="px-5 py-4 font-semibold text-gray-900">
                    <span className="inline-flex items-center gap-2">
                      <ChevronDown size={15} className={`text-[#94a3b8] transition-transform ${open ? 'rotate-180' : ''}`} />
                      {b.batchNumber}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-500">{fmtDate(b.createdAt)}</td>
                  <td className="px-5 py-4 text-gray-700">{b.totalForms}</td>
                  <td className="px-5 py-4 text-gray-700">{money(b.totalAmountCents)}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${BATCH_BADGE[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {b.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/portal/requisitions/${b.id}`); }}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Eye size={13} /> View
                      </button>
                      {['SUBMITTED', 'PROCESSING', 'COMPLETED'].includes(b.status) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadManifest(b.id, b.batchNumber); }}
                          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Download size={13} /> Manifest
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {open && (
                  <tr className="border-b border-[#F1F4F7] bg-[#FAFBFD]">
                    <td colSpan={6} className="px-6 py-6">
                      <div className="flex items-start justify-between">
                        {batchTimeline(b.status, b.createdAt).map((step, i, arr) => {
                          const isDone = step.status === 'done', isActive = step.status === 'active';
                          return (
                            <div key={step.label} className="flex flex-1 items-start">
                              <div className="flex flex-1 flex-col items-center text-center">
                                <span className={`grid h-9 w-9 place-items-center rounded-full text-[13px] font-bold ${isDone ? 'bg-[#4F46E5] text-white' : isActive ? 'bg-[#4F46E5] text-white ring-4 ring-[#4F46E5]/15' : 'border-2 border-[#E5E7EB] bg-white text-[#94a3b8]'}`}>
                                  {isDone ? <Check size={16} strokeWidth={3} /> : i + 1}
                                </span>
                                <div className={`mt-2 text-[12px] font-semibold ${isActive || isDone ? 'text-[#0a0b1a]' : 'text-[#94a3b8]'}`}>{step.label}</div>
                                <div className="text-[11px] text-[#94a3b8]">{step.date}</div>
                              </div>
                              {i < arr.length - 1 && <div className={`mt-4 h-0.5 flex-1 ${isDone ? 'bg-[#4F46E5]' : 'bg-[#E5E7EB]'}`} />}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
