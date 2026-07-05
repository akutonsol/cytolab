'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, Printer, RefreshCw, X } from 'lucide-react';
import { api } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  clients: { id: string; name: string }[];
}

const money = (cents?: number) => `$${((Number(cents) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
// Default period spans the last 90 days so existing seeded data shows on first load.
const ninetyDaysAgo = () => { const d = new Date(); d.setDate(d.getDate() - 90); d.setHours(0, 0, 0, 0); return d; };
const fmtD = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtDT = (d?: string) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const STATUS_LABEL: Record<string, string> = { Partial: 'PARTIAL', Completed: 'COMPLETE', Active: 'RECEIVED', Pending: 'PENDING', Disabled: 'DISABLED' };
const STATUS_COLOR: Record<string, string> = { Partial: '#B45309', Completed: '#15803D', Active: '#1D4ED8', Pending: '#475569', Disabled: '#475569' };
const stLabel = (s: string) => STATUS_LABEL[s] ?? s.toUpperCase();
const stColor = (s: string) => STATUS_COLOR[s] ?? '#475569';

export function RequisitionReportModal({ open, onClose, clients }: Props) {
  const [dateFrom, setDateFrom] = useState(iso(ninetyDaysAgo()));
  const [dateTo, setDateTo] = useState(iso(new Date()));
  const [groupBy, setGroupBy] = useState<'client' | 'status' | 'date'>('client');
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [footer, setFooter] = useState('');
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await api.get('/requisitions/report', { params: { dateFrom, dateTo, groupBy, clientId: clientId || undefined } });
      setReport(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not generate the report.');
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, groupBy, clientId]);

  // Auto-run once when the modal opens.
  useEffect(() => { if (open && !report) run(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [open]);

  if (!open) return null;

  // Reset the form to defaults and clear the rendered report (empty state).
  const reset = () => {
    setDateFrom(iso(ninetyDaysAgo()));
    setDateTo(iso(new Date()));
    setGroupBy('client');
    setClientId('');
    setReport(null);
    setError('');
  };

  const email = () => {
    if (!report) return;
    const subject = `Requisition Report — ${report.labName} — ${fmtD(report.period.from)} to ${fmtD(report.period.to)}`;
    const body = [
      'Requisition Report',
      `Period: ${fmtD(report.period.from)} to ${fmtD(report.period.to)}`,
      `Generated: ${fmtDT(report.generatedAt)}`,
      '',
      `Total Requisitions: ${report.totalRequisitions}`,
      `Total Amount: ${money(report.totalAmount)}`,
      '',
      ...report.groups.map((g: any) => `${g.label}: ${g.count} requisitions — ${money(g.subtotalAmount)}`),
      '',
      `Grand Total: ${money(report.totalAmount)}`,
    ].join('\n');
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const SELECT = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary';
  const TH = 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap';
  const TD = 'px-3 py-2 text-sm text-slate-700 align-middle';

  return (
    <div className="req-report-overlay fixed inset-x-0 bottom-0 top-[128px] z-[120] flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl" style={{ maxHeight: '85vh' }}>
        {/* Chrome (hidden when printing) */}
        <div className="no-print flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-bold text-charcoal-heading">Requisition Report</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {/* Controls */}
        <div className="no-print flex flex-wrap items-end gap-3 px-6 py-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Report period</label>
            <div className="flex items-center gap-2">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={SELECT} />
              <span className="text-slate-400">—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={SELECT} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Group by</label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)} className={SELECT}>
              <option value="client">By Client</option>
              <option value="status">By Status</option>
              <option value="date">By Date</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Client</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={SELECT}>
              <option value="">All Clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={run} disabled={loading} className="btn-primary" style={{ opacity: loading ? 0.6 : 1 }}>Run Report</button>
          <button onClick={reset} aria-label="Reset" title="Reset to defaults" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </div>

        {error && <div className="no-print mx-6 mb-4 rounded-xl border border-error/20 bg-error-container p-3 text-sm text-error">{error}</div>}

        {/* Report output (the only thing that prints) */}
        {report && (
          <div className="printable px-6 pb-6">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-lg font-bold text-charcoal-heading">{report.labName}</div>
                <div className="text-base font-semibold text-slate-600">Requisition Report</div>
                <div className="mt-1 text-xs text-slate-500">Period: {fmtD(report.period.from)} to {fmtD(report.period.to)}</div>
                <div className="text-xs text-slate-400">Generated: {fmtDT(report.generatedAt)}</div>
              </div>
              <div className="no-print flex items-center gap-1.5">
                <button onClick={email} aria-label="Email" title="Email" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-primary"><Mail size={16} /></button>
                <button onClick={() => window.print()} aria-label="Print" title="Print" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-primary"><Printer size={16} /></button>
              </div>
            </div>

            {report.groups.length === 0 && <div className="py-10 text-center text-sm text-slate-400">No requisitions in this period.</div>}

            {report.groups.map((g: any) => (
              <div key={g.label} className="req-report-group mt-5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-bold text-charcoal-heading">{g.label} <span className="font-normal text-slate-400">({g.count})</span></span>
                  <span className="text-sm font-semibold text-charcoal-heading">{money(g.subtotalAmount)}</span>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-y border-slate-100">
                      <th className={TH}>Ref#</th><th className={TH}>Client</th><th className={TH}>Accession</th>
                      <th className={`${TH} text-right`}>Ordered</th><th className={`${TH} text-right`}>Fulfilled</th>
                      <th className={`${TH} text-right`}>Amount</th><th className={TH}>Status</th><th className={TH}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.requisitions.map((r: any, i: number) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className={`${TD} font-semibold`}>#{r.refNo}</td>
                        <td className={TD}>{r.clientName}</td>
                        <td className={TD}>{r.accessionNo ?? '—'}</td>
                        <td className={`${TD} text-right`}>{r.orderedItems}</td>
                        <td className={`${TD} text-right`}>{r.fulfilledItems}</td>
                        <td className={`${TD} text-right font-semibold`}>{money(r.amount)}</td>
                        <td className={TD}><span className="text-[11px] font-bold" style={{ color: stColor(r.status) }}>{stLabel(r.status)}</span></td>
                        <td className={TD}>{fmtD(r.receivedAt)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 bg-slate-50/60">
                      <td className={`${TD} font-bold`} colSpan={3}>Subtotal ({g.count})</td>
                      <td className={`${TD} text-right font-bold`}>{g.subtotalOrdered}</td>
                      <td className={`${TD} text-right font-bold`}>{g.subtotalFulfilled}</td>
                      <td className={`${TD} text-right font-bold`}>{money(g.subtotalAmount)}</td>
                      <td className={TD} colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}

            {/* Grand total */}
            <div className="mt-5 flex items-center justify-between rounded-xl px-4 py-3" style={{ background: '#4F46E5' }}>
              <span className="text-sm font-bold text-white">Grand Total — {report.totalRequisitions} requisitions · ordered {report.totalOrdered} · fulfilled {report.totalFulfilled}</span>
              <span className="text-base font-bold text-white">{money(report.totalAmount)}</span>
            </div>

            {/* Notes + Footer */}
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Add notes..." className="req-report-field w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-700 outline-none focus:border-primary" style={{ resize: 'vertical' }} />
              <textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={3} placeholder="Add footer..." className="req-report-field w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-700 outline-none focus:border-primary" style={{ resize: 'vertical' }} />
            </div>
          </div>
        )}

        {!report && loading && <div className="px-6 pb-8 pt-2 text-center text-sm text-slate-400">Generating report…</div>}
        {!report && !loading && !error && <div className="no-print px-6 pb-8 pt-2 text-center text-sm text-slate-400">Choose a period and click “Run Report”.</div>}
      </div>
    </div>
  );
}
