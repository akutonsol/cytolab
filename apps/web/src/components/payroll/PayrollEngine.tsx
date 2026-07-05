'use client';

import { useState } from 'react';
import { AlertTriangle, Download, Play, Plus, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { jmd, fmtDate } from '@/lib/payroll';
import { fmtHours, empName } from '@/lib/workforce';

const CARD = 'rounded-xl border border-slate-100 bg-white shadow-sm';
const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap';
const CELL = 'px-4 py-3 align-middle text-sm';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const periodName = (month: number, year: number) => `${MONTHS[month - 1]} ${year}`;

const STATUS: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: '#F1F5F9', fg: '#64748B' },
  PROCESSING: { bg: '#EEF2FF', fg: '#4F46E5' },
  COMPLETED: { bg: '#DCFCE7', fg: '#16A34A' },
  CANCELLED: { bg: '#FEE2E2', fg: '#DC2626' },
};
function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.DRAFT;
  return <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: s.bg, color: s.fg }}>{status}</span>;
}

function csvCell(v: string | number) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── New Period modal ───────────────────────────────────────────────────────────
function NewPeriodModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [err, setErr] = useState('');
  const create = useMutation({
    mutationFn: () => api.post('/workforce/payroll/periods', { month, year }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll-periods'] }); onClose(); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed to create period'),
  });
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-charcoal-heading">New Payroll Period</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Month</label>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <label className="mb-1 block text-sm font-medium text-slate-600">Year</label>
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" />
        {err && <div className="mb-2 text-sm text-error">{err}</div>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={() => { setErr(''); create.mutate(); }} disabled={create.isPending} className="btn-primary">{create.isPending ? 'Creating…' : 'Create'}</button></div>
      </div>
    </div>
  );
}

// ── Period detail slide-over ───────────────────────────────────────────────────
function PeriodDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: p } = useQuery({ queryKey: ['payroll-period', id], queryFn: () => api.get(`/workforce/payroll/periods/${id}`).then((r) => r.data) });
  const entries: any[] = p?.entries ?? [];
  const summary = [
    ['Total Gross', jmd(p?.totalGrossCents ?? 0)],
    ['Total Net', jmd(p?.totalNetCents ?? 0)],
    ['Total Tax', jmd(p?.totalTaxCents ?? 0)],
    ['Employees', String(p?.employeeCount ?? entries.length)],
  ] as const;

  const exportCsv = () => downloadCsv(
    `payroll-${p ? periodName(p.month, p.year).replace(' ', '-') : id}.csv`,
    ['Employee', 'Regular Hours', 'OT Hours', 'Gross', 'NIS', 'NHT', 'Ed Tax', 'PAYE', 'Net'],
    entries.map((e) => [
      empName(e.employee), fmtHours(e.regularMinutes), fmtHours(e.overtimeMinutes),
      (e.grossCents / 100).toFixed(2), (e.nisCents / 100).toFixed(2), (e.nhtCents / 100).toFixed(2),
      (e.educationTaxCents / 100).toFixed(2), (e.payeCents / 100).toFixed(2), (e.netCents / 100).toFixed(2),
    ]),
  );

  return (
    <div className="fixed inset-0 z-[130] flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-lg font-bold text-charcoal-heading">{p ? periodName(p.month, p.year) : 'Payroll Period'}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              {p && <StatusBadge status={p.status} />}
              {p?.processedAt && <span>Processed {fmtDate(p.processedAt)}{p.processedBy ? ` · ${p.processedBy.firstName} ${p.processedBy.lastName}` : ''}</span>}
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.map(([label, value]) => (
              <div key={label} className={`${CARD} p-4`}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-bold text-charcoal-heading">{value}</div>
              </div>
            ))}
          </div>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-charcoal-heading">Entries</span>
            <button onClick={exportCsv} disabled={entries.length === 0} className="btn-secondary disabled:opacity-40"><Download size={15} /> Export CSV</button>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-slate-100"><th className={TH}>Employee</th><th className={`${TH} text-right`}>Reg Hrs</th><th className={`${TH} text-right`}>OT Hrs</th><th className={`${TH} text-right`}>Gross</th><th className={`${TH} text-right`}>NIS</th><th className={`${TH} text-right`}>NHT</th><th className={`${TH} text-right`}>Ed Tax</th><th className={`${TH} text-right`}>PAYE</th><th className={`${TH} text-right`}>Net</th></tr></thead>
                <tbody>
                  {entries.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">No entries — process this period to generate payroll.</td></tr>}
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100">
                      <td className={`${CELL} font-medium text-charcoal-heading`}>{empName(e.employee)}</td>
                      <td className={`${CELL} text-right`}>{fmtHours(e.regularMinutes)}</td>
                      <td className={`${CELL} text-right`}>{fmtHours(e.overtimeMinutes)}</td>
                      <td className={`${CELL} text-right font-semibold text-charcoal-heading`}>{jmd(e.grossCents)}</td>
                      <td className={`${CELL} text-right text-slate-600`}>{jmd(e.nisCents)}</td>
                      <td className={`${CELL} text-right text-slate-600`}>{jmd(e.nhtCents)}</td>
                      <td className={`${CELL} text-right text-slate-600`}>{jmd(e.educationTaxCents)}</td>
                      <td className={`${CELL} text-right text-slate-600`}>{jmd(e.payeCents)}</td>
                      <td className={`${CELL} text-right font-semibold text-charcoal-heading`}>{jmd(e.netCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PayrollEngine() {
  const { can } = useAuth();
  const isManager = can('employee:change');
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<any>(null);

  const { data: periods = [] } = useQuery({ queryKey: ['payroll-periods'], queryFn: () => api.get('/workforce/payroll/periods').then((r) => r.data) });
  const process = useMutation({
    mutationFn: (id: string) => api.post(`/workforce/payroll/periods/${id}/process`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll-periods'] }); setConfirm(null); },
  });

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-secondary">Create a period, then run the engine to calculate gross, statutory deductions and net for every active employee.</p>
        {isManager && <button onClick={() => setNewOpen(true)} className="btn-primary"><Plus size={16} /> New Period</button>}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><th className={TH}>Period</th><th className={`${TH} text-right`}>Employees</th><th className={`${TH} text-right`}>Gross</th><th className={`${TH} text-right`}>Net</th><th className={`${TH} text-right`}>Taxes</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Actions</th></tr></thead>
            <tbody>
              {periods.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">No payroll periods yet.</td></tr>}
              {periods.map((p: any) => (
                <tr key={p.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setDetailId(p.id)}>
                  <td className={`${CELL} font-medium text-charcoal-heading`}>{periodName(p.month, p.year)}</td>
                  <td className={`${CELL} text-right text-slate-600`}>{p.employeeCount}</td>
                  <td className={`${CELL} text-right`}>{jmd(p.totalGrossCents)}</td>
                  <td className={`${CELL} text-right font-semibold text-charcoal-heading`}>{jmd(p.totalNetCents)}</td>
                  <td className={`${CELL} text-right text-slate-600`}>{jmd(p.totalTaxCents)}</td>
                  <td className={CELL}><StatusBadge status={p.status} /></td>
                  <td className={CELL} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      {isManager && p.status === 'DRAFT' && (
                        <button onClick={() => setConfirm(p)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5"><Play size={14} /> Process</button>
                      )}
                      <button onClick={() => setDetailId(p.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">View</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {newOpen && <NewPeriodModal onClose={() => setNewOpen(false)} />}
      {detailId && <PeriodDrawer id={detailId} onClose={() => setDetailId(null)} />}

      {confirm && (
        <div className="fixed inset-0 z-[125] grid place-items-center bg-black/30 p-4" onClick={() => !process.isPending && setConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><AlertTriangle size={20} /></span>
              <h3 className="text-lg font-bold text-charcoal-heading">Process payroll?</h3>
            </div>
            <p className="mb-5 text-sm text-secondary">This will calculate payroll for all active employees for <span className="font-semibold text-charcoal-heading">{periodName(confirm.month, confirm.year)}</span>. Continue?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} disabled={process.isPending} className="btn-secondary">Cancel</button>
              <button onClick={() => process.mutate(confirm.id)} disabled={process.isPending} className="btn-primary">{process.isPending ? 'Processing…' : 'Process Payroll'}</button>
            </div>
            {process.isError && <div className="mt-2 text-sm text-error">Processing failed — please try again.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
