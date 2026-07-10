'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Send, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FeatureGate } from '@/components/FeatureGate';
import { fmtDate, fmtTime, SHIFT_CHIP } from '@/lib/workforce';
import { Card, Button, TableEmpty } from '@/components/ui';

const STATUS: Record<string, { bg: string; fg: string }> = {
  Draft: { bg: '#F1F5F9', fg: '#475569' }, Submitted: { bg: '#E0F2FE', fg: '#0284C7' }, UnderReview: { bg: '#EEF2FF', fg: '#4F46E5' },
  Approved: { bg: '#DCFCE7', fg: '#16A34A' }, Rejected: { bg: '#FEE2E2', fg: '#DC2626' }, PayrollLocked: { bg: '#F1F5F9', fg: '#334155' },
};

function Detail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: ts, isLoading } = useQuery({ queryKey: ['timesheet', id], queryFn: () => api.get(`/workforce/timesheets/${id}`).then((r) => r.data) });
  const act = useMutation({
    mutationFn: ({ action, reason }: { action: string; reason?: string }) => api.post(`/workforce/timesheets/${id}/${action}`, reason ? { reason } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timesheet', id] }),
  });

  if (isLoading || !ts) return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  const name = ts.employee?.user ? `${ts.employee.user.firstName} ${ts.employee.user.lastName}` : '—';
  const s = STATUS[ts.status] ?? STATUS.Draft;
  const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
  const CELL = 'px-4 py-3 align-middle text-sm';

  return (
    <div className="w-full">
      <Link href="/workforce/timesheets" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><ArrowLeft size={15} /> Timesheets</Link>

      <Card radius="sm" elevation="sm" border="subtle" className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <div className="text-xl font-bold text-charcoal-heading">{name}</div>
          <div className="text-sm text-slate-500">{ts.employee?.department?.name ?? '—'} · {fmtDate(ts.periodStart)} – {fmtDate(ts.periodEnd)}</div>
          <div className="mt-2"><span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: s.bg, color: s.fg }}>{ts.status.toUpperCase()}</span></div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right"><div className="text-2xl font-bold text-charcoal-heading">{ts.totalHours}h</div><div className="text-xs text-slate-500">{ts.regularHours} reg · {ts.overtimeHours} OT</div></div>
          <div className="flex gap-2">
            {ts.status === 'Draft' && <Button onClick={() => act.mutate({ action: 'submit' })}><Send size={15} /> Submit</Button>}
            {['Submitted', 'UnderReview'].includes(ts.status) && <>
              <button onClick={() => act.mutate({ action: 'approve' })} className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"><Check size={15} /> Approve</button>
              <button onClick={() => { const r = window.prompt('Reason for rejection?'); if (r) act.mutate({ action: 'reject', reason: r }); }} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"><X size={15} /> Reject</button>
            </>}
          </div>
        </div>
      </Card>

      <Card radius="sm" elevation="sm" border="subtle" className="p-0">
        <div className="px-5 pt-5 text-base font-semibold text-charcoal-heading">Daily Entries</div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-y border-slate-100"><th className={TH}>Date</th><th className={TH}>Shift</th><th className={TH}>Clock In</th><th className={TH}>Clock Out</th><th className={`${TH} text-right`}>Break</th><th className={`${TH} text-right`}>Regular</th><th className={`${TH} text-right`}>OT</th><th className={TH}>Notes</th></tr></thead>
            <tbody>
              {(ts.entries ?? []).length === 0 && <TableEmpty colSpan={8} tight>No clock activity in this period.</TableEmpty>}
              {(ts.entries ?? []).map((e: any) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className={`${CELL} font-medium text-charcoal-heading`}>{fmtDate(e.date)}</td>
                  <td className={CELL}><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SHIFT_CHIP[e.shift] ?? 'bg-slate-100 text-slate-700'}`}>{e.shift}</span></td>
                  <td className={`${CELL} text-slate-600`}>{e.clockIn ? fmtTime(e.clockIn) : '—'}</td>
                  <td className={`${CELL} text-slate-600`}>{e.clockOut ? fmtTime(e.clockOut) : '—'}</td>
                  <td className={`${CELL} text-right text-slate-600`}>{e.breakMinutes}m</td>
                  <td className={`${CELL} text-right`}>{e.regularHours}</td>
                  <td className={`${CELL} text-right`}>{e.overtimeHours}</td>
                  <td className={`${CELL} text-slate-500`}>{e.notes ?? '—'}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50/60">
                <td className={`${CELL} font-bold`} colSpan={5}>Totals</td>
                <td className={`${CELL} text-right font-bold`}>{ts.regularHours}</td>
                <td className={`${CELL} text-right font-bold`}>{ts.overtimeHours}</td>
                <td className={`${CELL} font-bold`}>{ts.totalHours}h</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function TimesheetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <FeatureGate feature="WORKFORCE_MANAGEMENT" fallback={<div className="p-8 text-sm text-secondary">Workforce Management is not enabled for this lab.</div>}><Detail id={id} /></FeatureGate>;
}
