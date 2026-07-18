'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Printer, Receipt } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card } from '@/components/ui';

interface InvoiceLine { id: string; description: string; quantity: number; unitPrice: number; amount: number }
interface Invoice { id: string; number: string; periodLabel: string; status: string; currency: string; subtotal: number; total: number; issueDate: string; dueDate?: string | null; notes?: string | null; lines: InvoiceLine[] }

const money = (cents: number, currency = 'JMD') => `${currency} ${((Number(cents) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

const STATUS_UI: Record<string, { bg: string; fg: string }> = {
  Sent: { bg: '#DBEAFE', fg: '#1D4ED8' },
  Paid: { bg: '#DCFCE7', fg: '#15803D' },
  Overdue: { bg: 'var(--status-warning-soft-100)', fg: 'var(--status-warning-strong)' },
  Void: { bg: '#FEE2E2', fg: '#B91C1C' },
};
function StatusTag({ s }: { s: string }) {
  const u = STATUS_UI[s] ?? { bg: '#F1F5F9', fg: '#475569' };
  return <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase" style={{ background: u.bg, color: u.fg }}>{s}</span>;
}

export default function AccountInvoicesPage() {
  const { can } = useAuth();
  const allowed = can('applicationprefs:view');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Invoice[]>({
    queryKey: ['my-lab-invoices'],
    queryFn: () => api.get('/lab-invoices').then((r) => r.data),
    enabled: allowed,
  });
  const invoices = data ?? [];
  const outstanding = invoices.filter((i) => i.status === 'Sent' || i.status === 'Overdue').reduce((s, i) => s + i.total, 0);
  const currency = invoices[0]?.currency ?? 'JMD';

  const printInvoice = (inv: Invoice) => {
    const rows = inv.lines.map((l) => `<tr><td>${l.description}</td><td style="text-align:center">${l.quantity}</td><td style="text-align:right">${money(l.unitPrice, inv.currency)}</td><td style="text-align:right">${money(l.amount, inv.currency)}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${inv.number}</title><style>body{font-family:Inter,Arial,sans-serif;color:#0F172A;margin:40px}h1{font-size:22px;color:#1E3A8A;margin:0 0 4px}.meta{color:#475569;font-size:13px;margin-bottom:24px}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;text-transform:uppercase;font-size:11px;letter-spacing:.06em;color:#64748B;border-bottom:2px solid #E2E8F0;padding:8px 10px}td{padding:8px 10px;border-bottom:1px solid #F1F5F9}tfoot td{font-weight:700;border-top:2px solid #E2E8F0;border-bottom:none}</style></head><body><h1>Invoice ${inv.number}</h1><div class="meta">${inv.periodLabel} · Issued ${fmtDate(inv.issueDate)} · Due ${fmtDate(inv.dueDate)} · ${inv.status}</div><table><thead><tr><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">Total</td><td style="text-align:right">${money(inv.total, inv.currency)}</td></tr></tfoot></table></body><script>window.onload=function(){window.print()}</script></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  };

  if (!allowed) {
    return <div className="w-full"><Card className="p-8 text-center text-slate-500">You don&apos;t have access to lab invoices.</Card></div>;
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-[38px] font-bold leading-tight tracking-tight text-charcoal-heading"><Receipt size={30} className="text-indigo-600" /> Invoices</h1>
        <p className="mt-1.5 text-base text-secondary">Your lab&apos;s platform invoices and their payment status.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-4">
        <Card className="flex-1 p-5"><div className="text-sm text-slate-500">Total invoices</div><div className="mt-1 text-3xl font-bold text-charcoal-heading">{invoices.length}</div></Card>
        <Card className="flex-1 p-5"><div className="text-sm text-slate-500">Outstanding balance</div><div className="mt-1 text-3xl font-bold" style={{ color: outstanding > 0 ? 'var(--status-warning-strong)' : '#15803D' }}>{money(outstanding, currency)}</div></Card>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                {['Invoice #', 'Period', 'Total', 'Status', 'Issued', 'Due', ''].map((h) => <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && invoices.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">No invoices yet.</td></tr>}
              {invoices.map((inv) => (
                <Fragment key={inv.id}>
                  <tr className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setOpenId(openId === inv.id ? null : inv.id)}>
                    <td className="px-5 py-4"><span className="flex items-center gap-2 font-mono text-sm font-bold text-charcoal-heading">{openId === inv.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{inv.number}</span></td>
                    <td className="px-5 py-4 text-sm text-slate-600">{inv.periodLabel}</td>
                    <td className="px-5 py-4 text-sm font-bold text-primary">{money(inv.total, inv.currency)}</td>
                    <td className="px-5 py-4"><StatusTag s={inv.status} /></td>
                    <td className="px-5 py-4 text-sm text-slate-600">{fmtDate(inv.issueDate)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{fmtDate(inv.dueDate)}</td>
                    <td className="px-5 py-4 text-right"><button onClick={(e) => { e.stopPropagation(); printInvoice(inv); }} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><Printer size={14} /> Print</button></td>
                  </tr>
                  {openId === inv.id && (
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <td colSpan={7} className="px-5 py-4">
                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><FileText size={13} /> Line items</div>
                          <table className="w-full text-sm">
                            <thead><tr className="text-left text-[11px] uppercase text-slate-400"><th className="py-1">Description</th><th className="py-1 text-center">Qty</th><th className="py-1 text-right">Unit</th><th className="py-1 text-right">Amount</th></tr></thead>
                            <tbody>
                              {inv.lines.map((l) => (
                                <tr key={l.id} className="border-t border-slate-100"><td className="py-2 text-charcoal-heading">{l.description}</td><td className="py-2 text-center text-slate-600">{l.quantity}</td><td className="py-2 text-right text-slate-600">{money(l.unitPrice, inv.currency)}</td><td className="py-2 text-right font-medium text-charcoal-heading">{money(l.amount, inv.currency)}</td></tr>
                              ))}
                            </tbody>
                            <tfoot><tr className="border-t-2 border-slate-200"><td colSpan={3} className="py-2 text-right font-semibold text-slate-600">Total</td><td className="py-2 text-right font-bold text-charcoal-heading">{money(inv.total, inv.currency)}</td></tr></tfoot>
                          </table>
                          {inv.notes && <div className="mt-3 text-xs text-slate-500">Note: {inv.notes}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
