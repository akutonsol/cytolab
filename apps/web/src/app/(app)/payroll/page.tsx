'use client';

import { useState } from 'react';
import { Banknote, CalendarDays, CheckCircle2, Play, Trash2, Users, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';

type RunStatus = 'Draft' | 'Processing' | 'Completed';
type AdviceStatus = 'Draft' | 'Issued' | 'Paid';
interface Run {
  id: string; period: string; status: RunStatus;
  totalGross: number; totalDeductions: number; totalNet: number; employeeCount: number;
  processedAt: string | null; processedBy: { firstName: string; lastName: string } | null; createdAt: string;
}
interface Advice {
  id: string; period: string;
  basicPay: number; overtime: number; allowances: number; grossPay: number;
  nis: number; nht: number; edTax: number; paye: number; otherDeductions: number; netPay: number;
  status: AdviceStatus; employeeId: string; payrollRunId: string | null;
  employee: { id: string; employeeNo: string; jobTitle: string; user: { firstName: string; lastName: string } };
}
interface RunDetail extends Run { payAdvices: Advice[] }
interface Stats { totalRuns: number; latestPeriod: string | null; latestNet: number; latestGross: number; latestEmployeeCount: number }

const fmtJMD = (cents: number) => 'J$' + Math.round(cents / 100).toLocaleString('en-US');
const fmtPeriod = (p: string) => { const [y, m] = p.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };
const thisPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

const RUN_BADGE: Record<RunStatus, { bg: string; color: string }> = {
  Draft: { bg: '#F1F5F9', color: '#64748B' },
  Processing: { bg: '#F0F9FF', color: '#0284C7' },
  Completed: { bg: '#F0FDF4', color: '#16A34A' },
};

export default function PayrollPage() {
  const qc = useQueryClient();
  const [processOpen, setProcessOpen] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Run | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };

  const { data: stats } = useQuery({ queryKey: ['payroll-stats'], queryFn: () => api.get<Stats>('/payroll/stats').then((r) => r.data) });
  const { data: runsData } = useQuery({ queryKey: ['payroll-runs'], queryFn: () => api.get<Paginated<Run>>('/payroll/runs', { params: { pageSize: 100 } }).then((r) => r.data) });
  const runs = runsData?.data ?? [];
  const refetch = () => { qc.invalidateQueries({ queryKey: ['payroll-runs'] }); qc.invalidateQueries({ queryKey: ['payroll-stats'] }); };

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/payroll/runs/delete/${id}`),
    onSuccess: () => { notify('ok', 'Payroll run deleted'); setConfirm(null); refetch(); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Delete failed'),
  });

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="px-6 py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-charcoal-heading">Payroll</h1>
            <p className="mt-1 font-body-sm text-body-sm text-secondary">Process monthly payroll and issue pay advices.</p>
          </div>
          <button className="btn-primary" onClick={() => setProcessOpen(true)}><Play size={16} /> Process Payroll</button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { icon: CalendarDays, label: 'Payroll Runs', value: String(stats?.totalRuns ?? 0), color: '#4F46E5' },
            { icon: CalendarDays, label: 'Latest Period', value: stats?.latestPeriod ? fmtPeriod(stats.latestPeriod) : '—', color: '#7C3AED' },
            { icon: Banknote, label: 'Latest Net', value: fmtJMD(stats?.latestNet ?? 0), color: '#16A34A' },
            { icon: Users, label: 'Employees Paid', value: String(stats?.latestEmployeeCount ?? 0), color: '#0284C7' },
          ].map((k) => (
            <div key={k.label} className="glass-card rounded-2xl p-5">
              <span style={{ background: `${k.color}15`, color: k.color }} className="mb-3 grid h-10 w-10 place-items-center rounded-xl"><k.icon size={18} /></span>
              <div className="font-display text-[22px] font-bold leading-none text-[#0F172A]">{k.value}</div>
              <div className="mt-1.5 font-label-sm text-label-sm uppercase tracking-wider text-secondary">{k.label}</div>
            </div>
          ))}
        </div>

        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/40 bg-surface-container-low/40">
                  {['Period', 'Status', 'Employees', 'Gross', 'Deductions', 'Net', 'Processed', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Banknote size={44} className="text-[#E2E8F0]" />
                      <p className="font-headline-sm text-headline-sm text-charcoal-heading">No payroll runs yet</p>
                      <p className="font-body-sm text-body-sm text-secondary">Process payroll for a period to generate pay advices.</p>
                    </div>
                  </td></tr>
                ) : runs.map((r) => {
                  const b = RUN_BADGE[r.status];
                  return (
                    <tr key={r.id} className="cursor-pointer border-b border-surface-container-low transition-colors hover:bg-surface-container-low/50" onClick={() => setOpenRunId(r.id)}>
                      <td className="px-4 py-3 font-body-sm text-body-sm font-semibold text-charcoal-heading">{fmtPeriod(r.period)}</td>
                      <td className="px-4 py-3"><span style={{ background: b.bg, color: b.color }} className="inline-block rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium">{r.status}</span></td>
                      <td className="px-4 py-3 font-body-sm text-body-sm text-secondary">{r.employeeCount}</td>
                      <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">{fmtJMD(r.totalGross)}</td>
                      <td className="px-4 py-3 font-body-sm text-body-sm text-secondary">{fmtJMD(r.totalDeductions)}</td>
                      <td className="px-4 py-3 font-body-sm text-body-sm font-semibold text-charcoal-heading">{fmtJMD(r.totalNet)}</td>
                      <td className="px-4 py-3 font-body-sm text-body-sm text-secondary">{r.processedAt ? new Date(r.processedAt).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setConfirm(r)} title="Delete run" className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-error-container hover:text-error"><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {processOpen && <ProcessModal onClose={() => setProcessOpen(false)} onDone={(msg) => { setProcessOpen(false); refetch(); notify('ok', msg); }} onError={(m) => notify('err', m)} />}
      {openRunId && <RunDetailModal runId={openRunId} onClose={() => setOpenRunId(null)} onChanged={refetch} notify={notify} />}

      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => setConfirm(null)}>
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Delete {fmtPeriod(confirm.period)} run?</h3>
            <p className="mt-2 font-body-sm text-body-sm text-secondary">This permanently deletes the run and its {confirm.employeeCount} pay advice{confirm.employeeCount === 1 ? '' : 's'}.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn-primary" style={{ background: '#DC2626', boxShadow: '0 4px 12px rgba(220,38,38,0.2)' }} disabled={del.isPending} onClick={() => del.mutate(confirm.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>}
    </div>
  );
}

function ProcessModal({ onClose, onDone, onError }: { onClose: () => void; onDone: (msg: string) => void; onError: (m: string) => void }) {
  const [period, setPeriod] = useState(thisPeriod());
  const run = useMutation({
    mutationFn: () => api.post<RunDetail>('/payroll/runs/process', { period }).then((r) => r.data),
    onSuccess: (d) => onDone(`Payroll processed — ${d.employeeCount} pay advices for ${fmtPeriod(d.period)}`),
    onError: (e: any) => onError(e?.response?.data?.message ?? 'Processing failed'),
  });
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Process Payroll</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low"><X size={16} /></button>
        </div>
        <p className="mb-4 font-body-sm text-body-sm text-secondary">Generates a pay advice for every active employee for the selected month, computing NIS, NHT, Education Tax and PAYE.</p>
        <label className="mb-1.5 block font-label-md text-label-md text-on-surface">Period<span className="text-error"> *</span></label>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
          className="h-11 w-full rounded-xl border border-outline-variant/40 bg-white px-3.5 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary" />
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!period || run.isPending} style={{ opacity: !period || run.isPending ? 0.5 : 1 }} onClick={() => run.mutate()}>
            {run.isPending ? 'Processing…' : 'Process'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RunDetailModal({ runId, onClose, onChanged, notify }: { runId: string; onClose: () => void; onChanged: () => void; notify: (t: 'ok' | 'err', m: string) => void }) {
  const qc = useQueryClient();
  const { data: run } = useQuery({ queryKey: ['payroll-run', runId], queryFn: () => api.get<RunDetail>(`/payroll/runs/${runId}`).then((r) => r.data) });
  const refetch = () => { qc.invalidateQueries({ queryKey: ['payroll-run', runId] }); onChanged(); };

  const pay = useMutation({
    mutationFn: (id: string) => api.put(`/payroll/advices/pay/${id}`, {}),
    onSuccess: () => { notify('ok', 'Marked as paid'); refetch(); },
    onError: () => notify('err', 'Failed to mark paid'),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[900px] flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-outline-variant/30 p-6 pb-4">
          <div>
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">{run ? fmtPeriod(run.period) : 'Payroll'} — Pay Advices</h3>
            {run && <p className="mt-0.5 font-body-sm text-body-sm text-secondary">{run.employeeCount} employees · Net {fmtJMD(run.totalNet)}{run.processedBy ? ` · processed by ${run.processedBy.firstName} ${run.processedBy.lastName}` : ''}</p>}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low"><X size={16} /></button>
        </div>
        <div className="overflow-auto p-2">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/40">
                {['Employee', 'Gross', 'NIS', 'NHT', 'Ed.Tax', 'PAYE', 'Net', 'Status', ''].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(run?.payAdvices ?? []).map((a) => (
                <tr key={a.id} className="border-b border-surface-container-low">
                  <td className="px-3 py-2.5">
                    <div className="font-body-sm text-body-sm font-semibold text-charcoal-heading">{a.employee.user.firstName} {a.employee.user.lastName}</div>
                    <div className="font-mono text-[12px] text-secondary">{a.employee.employeeNo}</div>
                  </td>
                  <td className="px-3 py-2.5 font-body-sm text-body-sm text-on-surface">{fmtJMD(a.grossPay)}</td>
                  <td className="px-3 py-2.5 font-body-sm text-body-sm text-secondary">{fmtJMD(a.nis)}</td>
                  <td className="px-3 py-2.5 font-body-sm text-body-sm text-secondary">{fmtJMD(a.nht)}</td>
                  <td className="px-3 py-2.5 font-body-sm text-body-sm text-secondary">{fmtJMD(a.edTax)}</td>
                  <td className="px-3 py-2.5 font-body-sm text-body-sm text-secondary">{fmtJMD(a.paye)}</td>
                  <td className="px-3 py-2.5 font-body-sm text-body-sm font-semibold text-charcoal-heading">{fmtJMD(a.netPay)}</td>
                  <td className="px-3 py-2.5">
                    {a.status === 'Paid'
                      ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm font-medium" style={{ background: '#F0FDF4', color: '#16A34A' }}><CheckCircle2 size={12} /> Paid</span>
                      : <span className="inline-block rounded-full px-2 py-0.5 font-label-sm text-label-sm font-medium" style={{ background: '#EEF2FF', color: '#4F46E5' }}>{a.status}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {a.status !== 'Paid' && <button onClick={() => pay.mutate(a.id)} className="rounded-lg border border-outline-variant/40 px-2.5 py-1 font-label-sm text-label-sm font-semibold text-primary hover:bg-primary-fixed">Mark paid</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
