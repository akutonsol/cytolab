'use client';

import { useState } from 'react';
import { AlertTriangle, Download, Play, Plus, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { jmd, fmtDate } from '@/lib/payroll';
import { fmtHours, empName } from '@/lib/workforce';
import { Card, Button, Th, Td, IconAction, TableEmpty } from '@/components/ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const periodName = (month: number, year: number) => `${MONTHS[month - 1]} ${year}`;

const STATUS: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: '#F1F5F9', fg: '#475569' },
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
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-charcoal-heading">New Payroll Period</h3><IconAction icon={<X size={18} />} onClick={onClose} /></div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Month</label>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <label className="mb-1 block text-sm font-medium text-slate-600">Year</label>
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" />
        {err && <div className="mb-2 text-sm text-error">{err}</div>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => { setErr(''); create.mutate(); }} disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create'}</Button></div>
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
          <IconAction icon={<X size={18} />} onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.map(([label, value]) => (
              <Card radius="sm" elevation="sm" border="subtle" className="p-4" key={label}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-xl font-bold text-charcoal-heading">{value}</div>
              </Card>
            ))}
          </div>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-charcoal-heading">Entries</span>
            <Button variant="secondary" onClick={exportCsv} disabled={entries.length === 0} className="disabled:opacity-40"><Download size={15} /> Export CSV</Button>
          </div>
          <Card radius="sm" elevation="sm" border="subtle" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-slate-100"><Th density="compact" size="xs">Employee</Th><Th density="compact" size="xs" className="text-right">Reg Hrs</Th><Th density="compact" size="xs" className="text-right">OT Hrs</Th><Th density="compact" size="xs" className="text-right">Gross</Th><Th density="compact" size="xs" className="text-right">NIS</Th><Th density="compact" size="xs" className="text-right">NHT</Th><Th density="compact" size="xs" className="text-right">Ed Tax</Th><Th density="compact" size="xs" className="text-right">PAYE</Th><Th density="compact" size="xs" className="text-right">Net</Th></tr></thead>
                <tbody>
                  {entries.length === 0 && <TableEmpty colSpan={9} tight>No entries — process this period to generate payroll.</TableEmpty>}
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100">
                      <Td density="compact" tone="inherit" className="text-sm font-medium text-charcoal-heading">{empName(e.employee)}</Td>
                      <Td density="compact" tone="inherit" className="text-sm text-right">{fmtHours(e.regularMinutes)}</Td>
                      <Td density="compact" tone="inherit" className="text-sm text-right">{fmtHours(e.overtimeMinutes)}</Td>
                      <Td density="compact" tone="inherit" className="text-sm text-right font-semibold text-charcoal-heading">{jmd(e.grossCents)}</Td>
                      <Td density="compact" tone="inherit" className="text-sm text-right text-slate-600">{jmd(e.nisCents)}</Td>
                      <Td density="compact" tone="inherit" className="text-sm text-right text-slate-600">{jmd(e.nhtCents)}</Td>
                      <Td density="compact" tone="inherit" className="text-sm text-right text-slate-600">{jmd(e.educationTaxCents)}</Td>
                      <Td density="compact" tone="inherit" className="text-sm text-right text-slate-600">{jmd(e.payeCents)}</Td>
                      <Td density="compact" tone="inherit" className="text-sm text-right font-semibold text-charcoal-heading">{jmd(e.netCents)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
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
        {isManager && <Button onClick={() => setNewOpen(true)}><Plus size={16} /> New Period</Button>}
      </div>

      <Card radius="sm" elevation="sm" border="subtle" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><Th density="compact" size="xs">Period</Th><Th density="compact" size="xs" className="text-right">Employees</Th><Th density="compact" size="xs" className="text-right">Gross</Th><Th density="compact" size="xs" className="text-right">Net</Th><Th density="compact" size="xs" className="text-right">Taxes</Th><Th density="compact" size="xs">Status</Th><Th density="compact" size="xs" className="text-right">Actions</Th></tr></thead>
            <tbody>
              {periods.length === 0 && <TableEmpty colSpan={7}>No payroll periods yet.</TableEmpty>}
              {periods.map((p: any) => (
                <tr key={p.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setDetailId(p.id)}>
                  <Td density="compact" tone="inherit" className="text-sm font-medium text-charcoal-heading">{periodName(p.month, p.year)}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right text-slate-600">{p.employeeCount}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right">{jmd(p.totalGrossCents)}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right font-semibold text-charcoal-heading">{jmd(p.totalNetCents)}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right text-slate-600">{jmd(p.totalTaxCents)}</Td>
                  <Td density="compact" tone="inherit" className="text-sm"><StatusBadge status={p.status} /></Td>
                  <Td density="compact" tone="inherit" className="text-sm" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      {isManager && p.status === 'DRAFT' && (
                        <button onClick={() => setConfirm(p)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5"><Play size={14} /> Process</button>
                      )}
                      <button onClick={() => setDetailId(p.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">View</button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
              <Button variant="secondary" onClick={() => setConfirm(null)} disabled={process.isPending}>Cancel</Button>
              <Button onClick={() => process.mutate(confirm.id)} disabled={process.isPending}>{process.isPending ? 'Processing…' : 'Process Payroll'}</Button>
            </div>
            {process.isError && <div className="mt-2 text-sm text-error">Processing failed — please try again.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
