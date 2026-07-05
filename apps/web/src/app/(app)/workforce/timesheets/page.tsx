'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Eye, Plus, Send, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FeatureGate } from '@/components/FeatureGate';
import { useEmployees, empName, fmtDate } from '@/lib/workforce';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';

const CARD = 'rounded-xl border border-slate-100 bg-white shadow-sm';
// Stable empty fallback — a fresh [] each render would retrigger the
// infinite-scroll fetchFn (which depends on the filtered array identity).
const NO_ROWS: any[] = [];
const STATUS: Record<string, { bg: string; fg: string }> = {
  Draft: { bg: '#F1F5F9', fg: '#475569' }, Submitted: { bg: '#E0F2FE', fg: '#0284C7' }, UnderReview: { bg: '#EEF2FF', fg: '#4F46E5' },
  Approved: { bg: '#DCFCE7', fg: '#16A34A' }, Rejected: { bg: '#FEE2E2', fg: '#DC2626' }, PayrollLocked: { bg: '#F1F5F9', fg: '#334155' },
};

function GenerateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: employees = [] } = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [periodStart, setStart] = useState(iso(new Date(Date.now() - 13 * 86_400_000)));
  const [periodEnd, setEnd] = useState(iso(new Date()));
  const [err, setErr] = useState('');
  const gen = useMutation({
    mutationFn: () => api.post('/workforce/timesheets/generate', { employeeId, periodStart, periodEnd }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['timesheets'] }); onClose(); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed to generate'),
  });
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-charcoal-heading">Generate Timesheet</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Employee</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary">
          <option value="">Select employee…</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{empName(e)}</option>)}
        </select>
        <div className="mb-4 flex gap-3">
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-slate-600">Period start</label><input type="date" value={periodStart} onChange={(e) => setStart(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-slate-600">Period end</label><input type="date" value={periodEnd} onChange={(e) => setEnd(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
        </div>
        {err && <div className="mb-2 text-sm text-error">{err}</div>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={() => gen.mutate()} disabled={!employeeId || gen.isPending} className="btn-primary" style={{ opacity: !employeeId || gen.isPending ? 0.5 : 1 }}>{gen.isPending ? 'Generating…' : 'Generate'}</button></div>
      </div>
    </div>
  );
}

function List() {
  const qc = useQueryClient();
  const [genOpen, setGenOpen] = useState(false);
  const [statusF, setStatusF] = useState('all');
  const { data } = useQuery({ queryKey: ['timesheets'], queryFn: () => api.get('/workforce/timesheets').then((r) => r.data) });
  const rows = (data ?? NO_ROWS) as any[];

  const act = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: string; reason?: string }) => api.post(`/workforce/timesheets/${id}/${action}`, reason ? { reason } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timesheets'] }),
  });
  const filtered = useMemo(() => rows.filter((r: any) => statusF === 'all' || r.status === statusF), [rows, statusF]);

  // Infinite scroll over the client-side filtered timesheets.
  const fetchFn = useCallback(
    (p: number, ps: number) => Promise.resolve(clientPage(filtered, p, ps)),
    [filtered],
  );
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } =
    useInfiniteScroll<any>({ fetchFn, pageSize: 20 });

  const TH = 'px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
  const CELL = 'px-5 py-4 align-middle text-sm';

  return (
    <div className="w-full">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Timesheets</h1><p className="mt-1 text-sm text-secondary">Auto-generated from clock events; review and approve.</p></div>
        <button onClick={() => setGenOpen(true)} className="btn-primary"><Plus size={16} /> Generate Timesheet</button>
      </div>

      <div className={`${CARD} mb-6 flex flex-wrap items-center gap-3 p-4`}>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary">
          <option value="all">All Statuses</option>{Object.keys(STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className={`${CARD} p-0`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><th className={TH}>Employee</th><th className={TH}>Period</th><th className={`${TH} text-right`}>Regular Hrs</th><th className={`${TH} text-right`}>OT Hrs</th><th className={`${TH} text-right`}>Total</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Actions</th></tr></thead>
            <tbody>
              {!initialLoading && filtered.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">No timesheets yet. Generate one from clock events.</td></tr>}
              {pageRows.map((r: any) => {
                const s = STATUS[r.status] ?? STATUS.Draft;
                const name = r.employee?.user ? `${r.employee.user.firstName} ${r.employee.user.lastName}` : '—';
                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className={`${CELL} font-medium text-charcoal-heading`}>{name}</td>
                    <td className={`${CELL} text-slate-600`}>{fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}</td>
                    <td className={`${CELL} text-right`}>{r.regularHours}</td>
                    <td className={`${CELL} text-right`}>{r.overtimeHours}</td>
                    <td className={`${CELL} text-right font-semibold text-charcoal-heading`}>{r.totalHours}</td>
                    <td className={CELL}><span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: s.bg, color: s.fg }}>{r.status.toUpperCase()}</span></td>
                    <td className={CELL}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/workforce/timesheets/${r.id}`} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-primary" title="View"><Eye size={16} /></Link>
                        {r.status === 'Draft' && <button onClick={() => act.mutate({ id: r.id, action: 'submit' })} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Submit"><Send size={15} /></button>}
                        {['Submitted', 'UnderReview'].includes(r.status) && <>
                          <button onClick={() => act.mutate({ id: r.id, action: 'approve' })} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-green-700 hover:bg-green-50" title="Approve"><Check size={16} /></button>
                          <button onClick={() => { const reason = window.prompt('Reason for rejection?'); if (reason) act.mutate({ id: r.id, action: 'reject', reason }); }} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50" title="Reject"><X size={16} /></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pageRows.length > 0 && (
          <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
        )}
      </div>
      {genOpen && <GenerateModal onClose={() => setGenOpen(false)} />}
    </div>
  );
}

export default function TimesheetsPage() {
  return <FeatureGate feature="WORKFORCE_MANAGEMENT" fallback={<div className="p-8 text-sm text-secondary">Workforce Management is not enabled for this lab.</div>}><List /></FeatureGate>;
}
