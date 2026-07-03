'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock, CreditCard,
  DollarSign, ExternalLink, Search, TrendingUp,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (cents: number) => '$' + ((cents ?? 0) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const relTime = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const CARD = 'rounded-[20px] border border-[#EEF2F7] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]';
// Zero-orange: BankTransfer uses a dark amber (#B45309) that stays clear of the
// orange range, not #D97706 (which the orange detector flags).
const TYPE_BADGE: Record<string, { bg: string; fg: string }> = {
  Cash: { bg: '#F0FDF4', fg: '#16A34A' },
  Cheque: { bg: '#EEF2FF', fg: '#4F46E5' },
  CreditCard: { bg: '#F5F3FF', fg: '#7C3AED' },
  DebitCard: { bg: '#F0F9FF', fg: '#0284C7' },
  BankTransfer: { bg: '#FFFBEB', fg: '#B45309' },
  Other: { bg: '#F1F5F9', fg: '#64748B' },
};
const badgeFor = (t: string) => TYPE_BADGE[t] ?? TYPE_BADGE.Other;
const TYPE_LABEL: Record<string, string> = { CreditCard: 'Credit Card', DebitCard: 'Debit Card', BankTransfer: 'Bank Transfer' };
const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;

interface Payment {
  id: string; billId: string; amount: number; type: string;
  referenceNo?: string | null; bank?: string | null; chequeNumber?: string | null;
  verified: boolean; datePaid: string; createdAt: string;
  bill?: any;
}
const clientName = (c?: any) => (c ? (c.officeName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || '—') : '—');
const PAGE_SIZE = 20;

// ─── Page ────────────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [verifiedFilter, setVerifiedFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const { data: summary } = useQuery<any>({ queryKey: ['payments-summary'], queryFn: () => api.get('/payments/summary').then((r) => r.data) });
  const { data: paymentsPage } = useQuery<Paginated<Payment>>({ queryKey: ['payments-all'], queryFn: () => api.get('/payments', { params: { pageSize: 200 } }).then((r) => r.data) });
  const { data: billsPage } = useQuery<Paginated<any>>({ queryKey: ['bills-all'], queryFn: () => api.get('/bills', { params: { pageSize: 500 } }).then((r) => r.data) });

  // Join strategy A — build a billId → bill map and enrich each payment.
  const billMap = useMemo(() => new Map((billsPage?.data ?? []).map((b: any) => [b.id, b])), [billsPage]);
  const payments = useMemo(() => (paymentsPage?.data ?? []).map((p) => ({ ...p, bill: billMap.get(p.billId) })), [paymentsPage, billMap]);

  const verify = useMutation({
    mutationFn: (id: string) => api.put(`/payment/verify/${id}`).then((r) => r.data),
    onSuccess: () => { notify('Payment verified ✓'); qc.invalidateQueries({ queryKey: ['payments-all'] }); qc.invalidateQueries({ queryKey: ['payments-summary'] }); },
    onError: (e: any) => notify(e?.response?.data?.message ?? 'Could not verify payment'),
  });

  // ── KPI aggregates ──
  const now = new Date();
  const totalCollected = payments.reduce((s, p) => s + (p.amount ?? 0), 0);
  const verifiedCount = payments.filter((p) => p.verified).length;
  const unverifiedCount = payments.filter((p) => !p.verified).length;
  const thisMonthPayments = payments.filter((p) => { const d = new Date(p.datePaid); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const thisMonthTotal = thisMonthPayments.reduce((s, p) => s + (p.amount ?? 0), 0);
  const avgPayment = payments.length ? Math.round(totalCollected / payments.length) : 0;

  // ── Filter + paginate ──
  const filtered = useMemo(() => {
    let rows = payments;
    if (typeFilter !== 'all') rows = rows.filter((p) => p.type === typeFilter);
    if (verifiedFilter === 'verified') rows = rows.filter((p) => p.verified);
    else if (verifiedFilter === 'unverified') rows = rows.filter((p) => !p.verified);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((p) => `${p.referenceNo ?? ''} ${p.bill?.referenceNo ?? ''} ${clientName(p.bill?.client)}`.toLowerCase().includes(q));
    }
    return rows;
  }, [payments, typeFilter, verifiedFilter, search]);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── Payment method breakdown ──
  const typeGroups = useMemo(() => {
    const map = new Map<string, { type: string; count: number; amount: number }>();
    payments.forEach((p) => { const g = map.get(p.type) ?? { type: p.type, count: 0, amount: 0 }; g.count += 1; g.amount += p.amount ?? 0; map.set(p.type, g); });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [payments]);
  const maxTypeCount = Math.max(1, ...typeGroups.map((g) => g.count));

  // ── Monthly collections (last 6 months) ──
  const monthly = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => { const dt = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); return { key: `${dt.getFullYear()}-${dt.getMonth()}`, m: dt.toLocaleDateString(undefined, { month: 'short' }), total: 0 }; });
    payments.forEach((p) => { const d = new Date(p.datePaid); const key = `${d.getFullYear()}-${d.getMonth()}`; const row = months.find((x) => x.key === key); if (row) row.total += p.amount ?? 0; });
    return months;
  }, [payments]); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = [
    { icon: DollarSign, label: 'Total Collected', value: fmt(summary?.collected ?? totalCollected), sub: 'All time', subColor: '#94A3B8' },
    { icon: CheckCircle, label: 'Verified Payments', value: String(verifiedCount), sub: `${unverifiedCount} pending verification`, subColor: unverifiedCount > 0 ? '#EF4444' : '#16A34A' },
    { icon: CreditCard, label: 'This Month', value: fmt(thisMonthTotal), sub: `${thisMonthPayments.length} payments`, subColor: '#94A3B8' },
    { icon: TrendingUp, label: 'Avg Payment', value: payments.length ? fmt(avgPayment) : '$0.00', sub: 'Per transaction', subColor: '#94A3B8' },
  ];

  return (
    <div className="min-h-full p-8" style={{ background: '#F7FAFD' }}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>Payments</h1>
          <p className="mt-1.5 text-[14px] text-[#6B7280]">Payment records and verification</p>
        </div>
        <div className="flex h-10 w-[280px] items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 text-[#9CA3AF]">
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reference or client…" className="w-full border-none bg-transparent text-[14px] text-[#0F172A] outline-none placeholder:text-[#9CA3AF]" />
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map(({ icon: Icon, label, value, sub, subColor }) => (
          <div key={label} className={`${CARD} flex items-center gap-4 p-5`}>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#EEF2FF]"><Icon size={20} color="#4F46E5" /></div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">{label}</div>
              <div className="mt-0.5 text-[22px] font-extrabold leading-none text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>{value}</div>
              <div className="mt-1 text-[11px] font-semibold" style={{ color: subColor }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Payment records table */}
      <div className={`${CARD} p-6`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-bold text-[#0F172A]">Payment Records · {total}</h2>
          <div className="flex items-center gap-2">
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#475569] outline-none focus:border-[#4F46E5]">
              <option value="all">All Types</option><option value="Cash">Cash</option><option value="Cheque">Cheque</option><option value="CreditCard">Credit Card</option><option value="DebitCard">Debit Card</option><option value="BankTransfer">Bank Transfer</option>
            </select>
            <select value={verifiedFilter} onChange={(e) => { setVerifiedFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#475569] outline-none focus:border-[#4F46E5]">
              <option value="all">All</option><option value="verified">Verified</option><option value="unverified">Unverified</option>
            </select>
          </div>
        </div>

        {pageRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <DollarSign size={30} className="text-[#D1D5DB]" />
            <div className="text-[15px] font-semibold text-[#0F172A]">No payments recorded yet</div>
            <div className="text-[13px] text-[#9CA3AF]">Payments appear here once invoices are settled.</div>
            <button onClick={() => router.push('/billing')} className="mt-2 text-[13px] font-semibold text-[#4F46E5] hover:underline">Go to Billing →</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-[11px] font-medium uppercase tracking-wide text-[#94A3B8]">
                  <th className="pb-3 font-medium">Date</th><th className="pb-3 font-medium">Bill#</th><th className="pb-3 font-medium">Client</th>
                  <th className="pb-3 text-right font-medium">Amount</th><th className="pb-3 font-medium">Type</th><th className="pb-3 font-medium">Reference</th>
                  <th className="pb-3 font-medium">Verified</th><th className="pb-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => {
                  const b = badgeFor(p.type);
                  return (
                    <tr key={p.id} className="border-b border-[#F3F4F6] transition-colors hover:bg-[#F9FAFB]" style={p.verified ? { boxShadow: 'inset 2px 0 0 0 #22C55E' } : undefined}>
                      <td className="py-3.5">
                        <div className="text-[13px] font-medium text-[#0F172A]">{fmtDate(p.datePaid)}</div>
                        <div className="text-[11px] text-[#94A3B8]">{relTime(p.datePaid)}</div>
                      </td>
                      <td className="whitespace-nowrap py-3.5 pr-4"><span className="font-mono text-[13px] font-bold text-[#0F172A]">{p.bill?.referenceNo ?? p.billId.slice(-8)}</span></td>
                      <td className="whitespace-nowrap py-3.5 pr-4 text-[14px] font-semibold text-[#0F172A]">{clientName(p.bill?.client)}</td>
                      <td className="py-3.5 text-right text-[14px] font-bold text-[#0F172A]">{fmt(p.amount)}</td>
                      <td className="py-3.5"><span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: b.bg, color: b.fg }}>{typeLabel(p.type)}</span></td>
                      <td className="py-3.5 text-[12px] text-[#64748B]">{p.referenceNo ?? p.bank ?? p.chequeNumber ?? '—'}</td>
                      <td className="py-3.5">
                        {p.verified
                          ? <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#16A34A]"><CheckCircle2 size={16} /> Verified</span>
                          : <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#94A3B8]"><Clock size={16} /> Pending</span>}
                      </td>
                      <td className="py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          {!p.verified && (
                            <button onClick={() => verify.mutate(p.id)} disabled={verify.isPending} style={{ background: '#EEF2FF', color: '#4F46E5', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: verify.isPending ? 0.6 : 1 }}>Verify</button>
                          )}
                          <button title="Open bill" onClick={() => router.push(`/billing?billId=${p.billId}`)} className="grid h-8 w-8 place-items-center rounded-full border border-[#EEF2F7] text-[#6B7280] transition-colors hover:bg-[#F5F7FF] hover:text-[#4F46E5]"><ExternalLink size={15} /></button>
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
            <button disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="grid h-9 w-9 place-items-center rounded-full border border-[#EEF2F7] text-[#6B7280] disabled:opacity-40 hover:bg-[#F5F7FF]"><ChevronLeft size={16} /></button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, safePage - 3), safePage + 2).map((n) => (
              <button key={n} onClick={() => setPage(n)} className="grid h-9 min-w-9 place-items-center rounded-full px-2 text-[13px] font-bold" style={{ background: n === safePage ? '#EEF3FF' : 'transparent', color: n === safePage ? '#4F46E5' : '#6B7280' }}>{n}</button>
            ))}
            <button disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="grid h-9 w-9 place-items-center rounded-full border border-[#EEF2F7] text-[#6B7280] disabled:opacity-40 hover:bg-[#F5F7FF]"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      {/* Breakdown: methods + monthly trend */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Payment methods */}
        <div className={`${CARD} p-6`}>
          <div className="mb-5 text-[16px] font-bold text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>Payment Methods</div>
          {typeGroups.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-[#9CA3AF]">No payments yet.</div>
          ) : (
            <div className="flex flex-col gap-4">
              {typeGroups.map((g) => {
                const b = badgeFor(g.type);
                return (
                  <div key={g.type}>
                    <div className="mb-1.5 flex items-center justify-between text-[13px]">
                      <span className="font-semibold text-[#0F172A]">{typeLabel(g.type)} <span className="font-medium text-[#94A3B8]">· {g.count}</span></span>
                      <span className="font-bold text-[#0F172A]">{fmt(g.amount)}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                      <div style={{ width: `${(g.count / maxTypeCount) * 100}%`, height: '100%', borderRadius: 999, background: b.fg }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Monthly collections */}
        <div className={`${CARD} p-6`}>
          <div className="mb-3 text-[16px] font-bold text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>Monthly Collections</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthly.map((m) => ({ m: m.m, v: m.total }))} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569', fontWeight: 500 }} dy={6} />
              <YAxis hide />
              <Tooltip cursor={{ stroke: '#E2E8F0' }} content={({ active, payload, label }: any) => {
                if (!active || !payload?.length) return null;
                return (
                  <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{label}</div>
                    <div style={{ color: '#4F46E5' }}>{fmt(payload[0].value)}</div>
                  </div>
                );
              }} />
              <Area type="monotone" dataKey="v" stroke="#4F46E5" strokeWidth={2} fill="url(#payGrad)" dot={{ r: 3, fill: '#4F46E5', stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 4 }} isAnimationActive animationDuration={800} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {toast && <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: '#16A34A' }}>{toast}</div>}
    </div>
  );
}
