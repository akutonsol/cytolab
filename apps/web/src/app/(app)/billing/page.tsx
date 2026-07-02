'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Clock, CreditCard, DollarSign,
  ExternalLink, Eye, Plus, Receipt, Search, TrendingUp, X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (cents: number) => '$' + ((cents ?? 0) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const CARD = 'rounded-[20px] border border-[#EEF2F7] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]';

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  Draft: { bg: '#F3F4F6', fg: '#6B7280' },
  Issued: { bg: '#EEF3FF', fg: '#4F46E5' },
  PartiallyPaid: { bg: '#F0F0FF', fg: '#7C3AED' },
  Paid: { bg: '#F0FDF4', fg: '#16A34A' },
  Void: { bg: '#FEF2F2', fg: '#DC2626' },
};
const PAYMENT_TYPES = [['Cash', 'Cash'], ['Cheque', 'Cheque'], ['CreditCard', 'Credit Card'], ['DebitCard', 'Debit Card'], ['BankTransfer', 'Bank Transfer']] as const;

interface Bill {
  id: string; referenceNo: string; status: string;
  subtotal: number; taxTotal: number; total: number; amountPaid: number;
  dueDate?: string | null; viewed: boolean; createdAt: string;
  recordId: string; record?: { id: string; identifier: string; status: string } | null;
  clientId?: string | null; client?: { firstName?: string; lastName?: string; officeName?: string | null } | null;
  lines?: any[]; taxes?: any[]; payments?: any[];
}
const clientName = (c?: Bill['client']) => (c ? (c.officeName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || '—') : '—');
const outstandingOf = (b: Bill) => (b.total ?? 0) - (b.amountPaid ?? 0);
const isOverdue = (b: Bill) => !!b.dueDate && new Date(b.dueDate).getTime() < Date.now() && b.status !== 'Paid' && b.status !== 'Void' && outstandingOf(b) > 0;
const PAGE_SIZE = 20;

// ─── Page ────────────────────────────────────────────────────────────────────
export default function BillingPage() {
  return <Suspense fallback={null}><BillingWorkspace /></Suspense>;
}

function BillingWorkspace() {
  const router = useRouter();
  const qc = useQueryClient();
  const recordIdParam = useSearchParams().get('recordId');

  const [tab, setTab] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [payBill, setPayBill] = useState<Bill | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };

  const { data: summary } = useQuery<any>({ queryKey: ['bills-summary'], queryFn: () => api.get('/bills/summary').then((r) => r.data) });
  const { data: billsPage } = useQuery<Paginated<Bill>>({ queryKey: ['bills-all'], queryFn: () => api.get('/bills', { params: { pageSize: 500 } }).then((r) => r.data) });
  const allBills = billsPage?.data ?? [];

  const refetch = () => { qc.invalidateQueries({ queryKey: ['bills-all'] }); qc.invalidateQueries({ queryKey: ['bills-summary'] }); if (drawerId) qc.invalidateQueries({ queryKey: ['bill', drawerId] }); };

  // KPIs — 3 from summary, overdue + thisMonth derived from the loaded bills.
  const monthStart = useMemo(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const overdueCount = allBills.filter(isOverdue).length;
  const thisMonth = allBills.filter((b) => new Date(b.createdAt).getTime() >= monthStart).reduce((s, b) => s + (b.total ?? 0), 0);

  const filtered = useMemo(() => {
    let rows = allBills;
    if (tab === 'unpaid') rows = rows.filter((b) => ['Draft', 'Issued', 'PartiallyPaid'].includes(b.status) && outstandingOf(b) > 0);
    else if (tab === 'paid') rows = rows.filter((b) => b.status === 'Paid');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((b) => `${b.referenceNo} ${clientName(b.client)} ${b.record?.identifier ?? ''}`.toLowerCase().includes(q));
    }
    return rows;
  }, [allBills, tab, search]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [tab, search]);

  // ?recordId= — open existing bill's drawer, else the create modal.
  const { data: recordForBill } = useQuery<any>({ queryKey: ['record-for-bill', recordIdParam], enabled: !!recordIdParam, queryFn: () => api.get(`/specimens/${recordIdParam}`).then((r) => r.data) });
  useEffect(() => {
    if (!recordIdParam || !billsPage) return;
    const existing = allBills.find((b) => b.recordId === recordIdParam);
    if (existing) setDrawerId(existing.id);
    else if (recordForBill?.status === 'Approved') setCreateOpen(true);
  }, [recordIdParam, billsPage, recordForBill]); // eslint-disable-line react-hooks/exhaustive-deps
  const clearParam = () => router.replace('/billing');

  return (
    <div className="min-h-full px-6 pb-10 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#0F172A]">Billing</h1>
          <p className="mt-1.5 text-[14px] text-[#6B7280]">Invoice and payment management</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex h-10 items-center gap-2 rounded-xl bg-[#4F46E5] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#4338CA]"><Receipt size={16} /> Create Invoice</button>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Kpi icon={DollarSign} label="Total Billed" value={fmt(summary?.billed ?? 0)} />
        <Kpi icon={CheckCircle} label="Total Paid" value={fmt(summary?.collected ?? 0)} color="#16A34A" />
        <Kpi icon={Clock} label="Outstanding" value={fmt(summary?.outstanding ?? 0)} color={(summary?.outstanding ?? 0) > 0 ? '#DC2626' : '#16A34A'} />
        <Kpi icon={AlertTriangle} label="Overdue" value={`${overdueCount} bills`} color={overdueCount > 0 ? '#DC2626' : '#6B7280'} />
        <Kpi icon={TrendingUp} label="This Month" value={fmt(thisMonth)} />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-6 border-b border-[#EEF2F7]">
        {(['all', 'unpaid', 'paid'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="relative pb-3 text-[14px] font-semibold capitalize transition-colors" style={{ color: tab === t ? '#4F46E5' : '#6B7280' }}>
            {t}{tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#4F46E5]" />}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className={`${CARD} p-6`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-[#0F172A]">Bills · {total}</h2>
          <div className="flex h-9 w-[260px] items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3.5 text-[#9CA3AF]">
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search bills…" className="w-full border-none bg-transparent text-[13px] text-[#0F172A] outline-none placeholder:text-[#9CA3AF]" />
          </div>
        </div>

        {pageRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Receipt size={30} className="text-[#D1D5DB]" />
            <div className="text-[15px] font-semibold text-[#0F172A]">No bills yet</div>
            <div className="text-[13px] text-[#9CA3AF]">Create an invoice from an approved record.</div>
            <button onClick={() => router.push('/records')} className="mt-2 text-[13px] font-semibold text-[#4F46E5] hover:underline">Go to Records →</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#F3F4F6] text-[12px] font-medium uppercase tracking-wide text-[#9CA3AF]">
                  <th className="pb-3 font-medium">Bill#</th><th className="pb-3 font-medium">Client</th><th className="pb-3 font-medium">Record</th>
                  <th className="pb-3 text-right font-medium">Amount</th><th className="pb-3 text-right font-medium">Paid</th><th className="pb-3 text-right font-medium">Outstanding</th>
                  <th className="pb-3 font-medium">Status</th><th className="pb-3 font-medium">Due</th><th className="pb-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((b) => {
                  const out = outstandingOf(b); const over = isOverdue(b);
                  return (
                    <tr key={b.id} onClick={() => setDrawerId(b.id)} className="cursor-pointer border-b border-[#F3F4F6] transition-colors hover:bg-[#F9FAFB]"
                      style={over ? { boxShadow: 'inset 3px 0 0 0 #EF4444' } : undefined}>
                      <td className="py-3.5"><span className="font-mono text-[13px] font-bold text-[#0F172A]">{b.referenceNo}</span></td>
                      <td className="py-3.5 text-[14px] font-semibold text-[#0F172A]">{clientName(b.client)}</td>
                      <td className="py-3.5"><span className="font-mono text-[13px] text-[#9CA3AF]">{b.record?.identifier ?? '—'}</span></td>
                      <td className="py-3.5 text-right text-[14px] font-medium text-[#0F172A]">{fmt(b.total)}</td>
                      <td className="py-3.5 text-right text-[14px] font-medium" style={{ color: b.amountPaid > 0 ? '#16A34A' : '#9CA3AF' }}>{fmt(b.amountPaid)}</td>
                      <td className="py-3.5 text-right text-[14px] font-semibold" style={{ color: out > 0 ? '#DC2626' : '#16A34A' }}>{fmt(out)}</td>
                      <td className="py-3.5"><StatusBadge status={b.status} /></td>
                      <td className="py-3.5 text-[14px]" style={{ color: over ? '#DC2626' : '#6B7280' }}>{fmtDate(b.dueDate)}</td>
                      <td className="py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <IconBtn title="View invoice" onClick={() => setDrawerId(b.id)}><Eye size={15} /></IconBtn>
                          <IconBtn title="Record payment" onClick={() => setPayBill(b)}><CreditCard size={15} /></IconBtn>
                          <IconBtn title="Open record" onClick={() => b.record && router.push(`/records/${b.record.id}`)}><ExternalLink size={15} /></IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="grid h-9 w-9 place-items-center rounded-full border border-[#EEF2F7] text-[#6B7280] disabled:opacity-40 hover:bg-[#F5F7FF]"><ChevronLeft size={16} /></button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), page + 2).map((n) => (
              <button key={n} onClick={() => setPage(n)} className="grid h-9 min-w-9 place-items-center rounded-full px-2 text-[13px] font-bold" style={{ background: n === page ? '#EEF3FF' : 'transparent', color: n === page ? '#4F46E5' : '#6B7280' }}>{n}</button>
            ))}
            <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="grid h-9 w-9 place-items-center rounded-full border border-[#EEF2F7] text-[#6B7280] disabled:opacity-40 hover:bg-[#F5F7FF]"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      {drawerId && <BillDrawer id={drawerId} onClose={() => setDrawerId(null)} onPay={(b) => setPayBill(b)} onChanged={refetch} notify={notify} />}
      {createOpen && <CreateInvoiceModal presetRecordId={recordIdParam} onClose={() => { setCreateOpen(false); if (recordIdParam) clearParam(); }} onCreated={() => { setCreateOpen(false); refetch(); notify('ok', 'Invoice created'); if (recordIdParam) clearParam(); }} notify={notify} />}
      {payBill && <PaymentModal bill={payBill} onClose={() => setPayBill(null)} onPaid={() => { setPayBill(null); refetch(); notify('ok', 'Payment recorded'); }} notify={notify} />}

      {toast && <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>}
    </div>
  );
}

// ─── Small components ────────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-[#EEF2F7] bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 text-[#6B7280]"><Icon size={18} /><span className="text-[12px]">{label}</span></div>
      <div className="mt-3 text-[24px] font-bold leading-none" style={{ color: color ?? '#0F172A' }}>{value}</div>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.Draft;
  return <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: s.bg, color: s.fg }}>{status === 'PartiallyPaid' ? 'Partial' : status}</span>;
}
function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-full border border-[#EEF2F7] text-[#6B7280] transition-colors hover:bg-[#F5F7FF] hover:text-[#4F46E5]">{children}</button>;
}

// ─── Bill Detail drawer ──────────────────────────────────────────────────────
function BillDrawer({ id, onClose, onPay, onChanged, notify }: { id: string; onClose: () => void; onPay: (b: Bill) => void; onChanged: () => void; notify: (t: 'ok' | 'err', m: string) => void }) {
  const { data: bill } = useQuery<Bill>({ queryKey: ['bill', id], queryFn: () => api.get(`/bill/${id}`).then((r) => r.data) });
  const issue = useMutation({ mutationFn: () => api.put(`/bill/billed/${id}`).then((r) => r.data), onSuccess: () => { notify('ok', 'Bill issued'); onChanged(); }, onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not issue') });
  const markViewed = useMutation({ mutationFn: () => api.put(`/bill/viewed/${id}`).then((r) => r.data), onSuccess: () => { notify('ok', 'Marked as viewed'); onChanged(); }, onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Failed') });

  const box = 'rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] p-5';
  const out = bill ? outstandingOf(bill) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="premium-scroll flex h-full w-full max-w-[560px] flex-col overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#EEF2F7] bg-white px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-[17px] font-bold text-[#0F172A]">Invoice</span>
            <span className="font-mono text-[13px] text-[#6B7280]">{bill?.referenceNo ?? '…'}</span>
            {bill && <StatusBadge status={bill.status} />}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6]"><X size={18} /></button>
        </div>

        {!bill ? <div className="grid flex-1 place-items-center text-[13px] text-[#9CA3AF]">Loading…</div> : (
          <div className="flex flex-col gap-5 p-6">
            {/* Invoice header */}
            <div className={box}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[18px] font-extrabold tracking-tight text-[#4F46E5]">CYTOLAB</div>
                  <div className="text-[12px] text-[#6B7280]">Cytology &amp; Pathology Laboratory</div>
                </div>
                <div className="text-right">
                  <div className="text-[20px] font-extrabold tracking-tight text-[#0F172A]">INVOICE</div>
                  <div className="font-mono text-[13px] text-[#6B7280]">{bill.referenceNo}</div>
                  <div className="mt-1 text-[12px] text-[#9CA3AF]">Date: {fmtDate(bill.createdAt)}</div>
                  <div className="text-[12px] text-[#9CA3AF]">Due: {fmtDate(bill.dueDate)}</div>
                </div>
              </div>
              <div className="mt-4 border-t border-[#EEF2F7] pt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Bill To</div>
                <div className="mt-0.5 text-[14px] font-bold text-[#0F172A]">{clientName(bill.client)}</div>
                <div className="font-mono text-[12px] text-[#9CA3AF]">{bill.record?.identifier ?? '—'}</div>
              </div>
            </div>

            {/* Line items */}
            <div>
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#F3F4F6] text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">
                    <th className="pb-2 font-medium">Service</th><th className="pb-2 font-medium">Code</th>
                    <th className="pb-2 text-center font-medium">Qty</th><th className="pb-2 text-right font-medium">Unit</th><th className="pb-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(bill.lines ?? []).map((l) => (
                    <tr key={l.id} className="border-b border-[#F9FAFB]">
                      <td className="py-2 text-[#0F172A]">{l.serviceName}</td>
                      <td className="py-2 text-[#9CA3AF]">{l.serviceCode ?? '—'}</td>
                      <td className="py-2 text-center text-[#6B7280]">{l.quantity}</td>
                      <td className="py-2 text-right text-[#6B7280]">{fmt(l.unitPrice)}</td>
                      <td className="py-2 text-right font-medium text-[#0F172A]">{fmt(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
                <Row label="Subtotal" value={fmt(bill.subtotal)} />
                {(bill.taxes ?? []).map((t) => <Row key={t.id} label={`${t.name} (${(t.rateBasisPoints / 100).toFixed(t.rateBasisPoints % 100 ? 2 : 0)}%)`} value={fmt(t.amount)} muted />)}
                <div className="mt-1 flex items-center justify-between border-t border-[#EEF2F7] pt-2 text-[15px] font-bold text-[#0F172A]"><span>Total</span><span>{fmt(bill.total)}</span></div>
              </div>
            </div>

            {/* Payments */}
            <div>
              <div className="mb-2 text-[14px] font-bold text-[#0F172A]">Payments</div>
              {(bill.payments ?? []).length === 0 ? <div className="text-[13px] text-[#9CA3AF]">No payments recorded.</div> : (
                <div className="flex flex-col gap-2">
                  {bill.payments!.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-[#F1F3F7] px-3 py-2 text-[13px]">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-semibold text-[#374151]">{p.type}</span>
                        <span className="text-[#9CA3AF]">{fmtDate(p.datePaid)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#0F172A]">{fmt(p.amount)}</span>
                        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={p.verified ? { background: '#F0FDF4', color: '#16A34A' } : { background: '#F3F4F6', color: '#6B7280' }}>{p.verified ? 'Verified' : 'Unverified'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
                <Row label="Amount Paid" value={fmt(bill.amountPaid)} valueColor="#16A34A" />
                <Row label="Outstanding" value={fmt(out)} valueColor={out > 0 ? '#DC2626' : '#16A34A'} bold />
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 border-t border-[#EEF2F7] pt-4">
              {(bill.status === 'Issued' || bill.status === 'Draft' || bill.status === 'PartiallyPaid') && out > 0 && (
                <button onClick={() => onPay(bill)} className="flex items-center gap-2 rounded-xl bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-[#4338CA]"><CreditCard size={15} /> Record Payment</button>
              )}
              {bill.status === 'Draft' && (
                <button onClick={() => issue.mutate()} disabled={issue.isPending} className="rounded-xl border border-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-[#4F46E5] hover:bg-[#EEF3FF] disabled:opacity-60">Issue Bill</button>
              )}
              {bill.status === 'Paid' && (
                <button onClick={() => (window.location.href = '/reports')} className="rounded-xl border border-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-[#4F46E5] hover:bg-[#EEF3FF]">Download Invoice PDF</button>
              )}
              {!bill.viewed && (
                <button onClick={() => markViewed.mutate()} disabled={markViewed.isPending} className="rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-[14px] font-semibold text-[#6B7280] hover:text-[#0F172A] disabled:opacity-60">Mark as Viewed</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function Row({ label, value, muted, bold, valueColor }: { label: string; value: string; muted?: boolean; bold?: boolean; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}>{label}</span>
      <span className={bold ? 'font-bold' : 'font-medium'} style={{ color: valueColor ?? '#0F172A' }}>{value}</span>
    </div>
  );
}

// ─── Create Invoice modal ────────────────────────────────────────────────────
function CreateInvoiceModal({ presetRecordId, onClose, onCreated, notify }: { presetRecordId: string | null; onClose: () => void; onCreated: () => void; notify: (t: 'ok' | 'err', m: string) => void }) {
  const [recordId, setRecordId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [lines, setLines] = useState<{ serviceId: string; quantity: number }[]>([{ serviceId: '', quantity: 1 }]);
  const [taxIds, setTaxIds] = useState<string[]>([]);

  const { data: recordsPage } = useQuery<Paginated<any>>({ queryKey: ['billable-records'], queryFn: () => api.get('/specimens/billable', { params: { pageSize: 100 } }).then((r) => r.data) });
  const { data: servicesPage } = useQuery<Paginated<any>>({ queryKey: ['services-all'], queryFn: () => api.get('/services', { params: { pageSize: 200 } }).then((r) => r.data) });
  const { data: taxes } = useQuery<any[]>({ queryKey: ['taxes'], queryFn: () => api.get('/taxes').then((r) => r.data) });
  const records = recordsPage?.data ?? [];
  const services = (servicesPage?.data ?? []).filter((s: any) => s.active);

  useEffect(() => { if (taxes && taxIds.length === 0) setTaxIds(taxes.filter((t) => t.isDefault).map((t) => t.id)); }, [taxes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (presetRecordId && records.some((r: any) => r.id === presetRecordId)) setRecordId(presetRecordId); }, [presetRecordId, records]);

  const record = records.find((r: any) => r.id === recordId);
  const priceOf = (sid: string) => services.find((s: any) => s.id === sid)?.price ?? 0;
  const subtotal = lines.reduce((s, l) => s + priceOf(l.serviceId) * (l.quantity || 0), 0);
  const taxTotal = (taxes ?? []).filter((t) => taxIds.includes(t.id)).reduce((s, t) => s + Math.round((subtotal * t.rateBasisPoints) / 10000), 0);
  const total = subtotal + taxTotal;
  const canSave = !!recordId && lines.some((l) => l.serviceId && l.quantity > 0);

  const create = useMutation({
    mutationFn: async (issue: boolean) => {
      const payload = { recordId, clientId: record?.clientId ?? undefined, dueDate: dueDate ? new Date(dueDate).toISOString() : undefined, lines: lines.filter((l) => l.serviceId && l.quantity > 0).map((l) => ({ serviceId: l.serviceId, quantity: l.quantity })), taxIds };
      const bill = await api.post('/bill/create', payload).then((r) => r.data);
      if (issue) await api.put(`/bill/billed/${bill.id}`);
      return bill;
    },
    onSuccess: onCreated,
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not create invoice'),
  });

  const recLabel = (r: any) => `${r.labNumber ?? r.identifier} — ${r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : '—'} — ${r.client ? (r.client.officeName || `${r.client.firstName} ${r.client.lastName}`) : '—'}`;
  const input = 'h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#4F46E5]';
  const label = 'text-[13px] font-semibold text-[#0F172A]';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="premium-scroll max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div><div className="text-[20px] font-bold text-[#0F172A]">Create Invoice</div><div className="mt-0.5 text-[14px] text-[#6B7280]">Bill an approved record.</div></div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6]"><X size={18} /></button>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={label}>Record</span>
              <div className="relative">
                <select value={recordId} onChange={(e) => setRecordId(e.target.value)} className={`${input} appearance-none pr-8`}>
                  <option value="">Select an approved record…</option>
                  {records.map((r: any) => <option key={r.id} value={r.id}>{recLabel(r)}</option>)}
                </select>
              </div>
            </label>
            <label className="flex flex-col gap-1.5"><span className={label}>Due Date</span><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={input} /></label>
          </div>
          {record && <div className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#6B7280]">Client: <span className="font-semibold text-[#0F172A]">{record.client ? (record.client.officeName || `${record.client.firstName} ${record.client.lastName}`) : '—'}</span></div>}

          {/* Line items */}
          <div>
            <div className="mb-2 text-[13px] font-semibold text-[#0F172A]">Line Items</div>
            <div className="flex flex-col gap-2">
              {lines.map((l, i) => {
                const price = priceOf(l.serviceId);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select value={l.serviceId} onChange={(e) => setLines((s) => s.map((x, j) => j === i ? { ...x, serviceId: e.target.value } : x))} className={`${input} flex-1 appearance-none`}>
                      <option value="">Select service…</option>
                      {services.map((s: any) => <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>)}
                    </select>
                    <input type="number" min={1} value={l.quantity} onChange={(e) => setLines((s) => s.map((x, j) => j === i ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x))} className={`${input} w-16 text-center`} />
                    <div className="w-24 text-right text-[13px] text-[#6B7280]">{fmt(price)}</div>
                    <div className="w-24 text-right text-[13px] font-semibold text-[#0F172A]">{fmt(price * (l.quantity || 0))}</div>
                    <button onClick={() => setLines((s) => s.length > 1 ? s.filter((_, j) => j !== i) : s)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#FEF2F2] hover:text-[#EF4444]"><X size={15} /></button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setLines((s) => [...s, { serviceId: '', quantity: 1 }])} className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#4F46E5] hover:underline"><Plus size={14} /> Add Line</button>
          </div>

          {/* Taxes */}
          {(taxes ?? []).length > 0 && (
            <div>
              <div className="mb-2 text-[13px] font-semibold text-[#0F172A]">Taxes</div>
              <div className="flex flex-wrap gap-3">
                {taxes!.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px]">
                    <input type="checkbox" checked={taxIds.includes(t.id)} onChange={(e) => setTaxIds((s) => e.target.checked ? [...s, t.id] : s.filter((x) => x !== t.id))} className="accent-[#4F46E5]" />
                    <span className="font-medium text-[#0F172A]">{t.name} — {(t.rateBasisPoints / 100).toFixed(t.rateBasisPoints % 100 ? 2 : 0)}%</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-xl bg-[#F8FAFC] p-4">
            <Row label="Subtotal" value={fmt(subtotal)} />
            <div className="mt-1.5"><Row label="Tax" value={fmt(taxTotal)} muted /></div>
            <div className="mt-2 flex items-center justify-between border-t border-[#EEF2F7] pt-2 text-[16px] font-bold text-[#0F172A]"><span>Total</span><span>{fmt(total)}</span></div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button onClick={onClose} className="h-10 rounded-lg border border-[#E5E7EB] px-4 text-[14px] font-semibold text-[#6B7280] hover:text-[#0F172A]">Cancel</button>
          <button onClick={() => create.mutate(false)} disabled={!canSave || create.isPending} className="h-10 rounded-lg border border-[#4F46E5] px-4 text-[14px] font-semibold text-[#4F46E5] hover:bg-[#EEF3FF] disabled:opacity-50">Save as Draft</button>
          <button onClick={() => create.mutate(true)} disabled={!canSave || create.isPending} className="h-10 rounded-lg bg-[#4F46E5] px-5 text-[14px] font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50">{create.isPending ? 'Saving…' : 'Create & Issue'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Record Payment modal ────────────────────────────────────────────────────
function PaymentModal({ bill, onClose, onPaid, notify }: { bill: Bill; onClose: () => void; onPaid: () => void; notify: (t: 'ok' | 'err', m: string) => void }) {
  const out = outstandingOf(bill);
  const [amount, setAmount] = useState((out / 100).toFixed(2));
  const [type, setType] = useState('Cash');
  const [referenceNo, setReferenceNo] = useState('');

  const pay = useMutation({
    mutationFn: () => api.post('/payment/create', { billId: bill.id, amount: Math.round(Number(amount) * 100), type, referenceNo: referenceNo || undefined }).then((r) => r.data),
    onSuccess: onPaid,
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not record payment'),
  });
  const cents = Math.round(Number(amount) * 100);
  const valid = cents >= 1 && cents <= out;
  const input = 'h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#4F46E5]';
  const label = 'text-[13px] font-semibold text-[#0F172A]';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div><div className="text-[20px] font-bold text-[#0F172A]">Record Payment</div><div className="mt-0.5 text-[14px] text-[#6B7280]">{bill.referenceNo} · Outstanding {fmt(out)}</div></div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6]"><X size={18} /></button>
        </div>
        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5"><span className={label}>Amount</span>
            <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#9CA3AF]">$</span><input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} pl-7`} /></div>
            {!valid && <span className="text-[12px] text-[#DC2626]">Enter an amount between $0.01 and {fmt(out)}.</span>}
          </label>
          <label className="flex flex-col gap-1.5"><span className={label}>Payment Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className={`${input} appearance-none`}>{PAYMENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1.5"><span className={label}>Reference No</span><input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Optional" className={input} /></label>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button onClick={onClose} className="h-10 rounded-lg border border-[#E5E7EB] px-4 text-[14px] font-semibold text-[#6B7280] hover:text-[#0F172A]">Cancel</button>
          <button onClick={() => pay.mutate()} disabled={!valid || pay.isPending} className="h-10 rounded-lg bg-[#4F46E5] px-5 text-[14px] font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50">{pay.isPending ? 'Recording…' : 'Record Payment'}</button>
        </div>
      </div>
    </div>
  );
}
