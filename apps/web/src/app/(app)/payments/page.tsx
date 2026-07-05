'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock,
  Download, ExternalLink, MoreHorizontal, Plus, Search, Settings, SlidersHorizontal, TrendingUp, DollarSign,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white';
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
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAGE_SIZE = 20;

const SortIcon = () => (
  <span className="inline-flex flex-col leading-none text-[#CBD5E1]"><ChevronUp size={10} /><ChevronDown size={10} style={{ marginTop: -3 }} /></span>
);
const DeltaPill = ({ n, pct }: { n: number; pct?: boolean }) => {
  const pos = n >= 0;
  return <span style={{ background: pos ? '#DCFCE7' : '#FEE2E2', color: pos ? '#16A34A' : '#DC2626', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{pos ? '+' : ''}{n}{pct ? '%' : ''}</span>;
};

// ─── Page ────────────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'unverified' | 'verified'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [timeframe, setTimeframe] = useState('all');
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState('Yearly');
  const [menuId, setMenuId] = useState<string | null>(null);
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

  // ── Aggregates + deltas ──
  const now = new Date();
  const week = 7 * 24 * 3600 * 1000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const totalCollected = payments.reduce((s, p) => s + (p.amount ?? 0), 0);
  const verifiedCount = payments.filter((p) => p.verified).length;
  const unverifiedCount = payments.filter((p) => !p.verified).length;
  const thisWeek = payments.filter((p) => Date.now() - new Date(p.datePaid).getTime() < week);
  const lastWeek = payments.filter((p) => { const age = Date.now() - new Date(p.datePaid).getTime(); return age >= week && age < 2 * week; });
  const weekDelta = thisWeek.length - lastWeek.length;
  const thisMonthP = payments.filter((p) => new Date(p.datePaid).getTime() >= monthStart);
  const lastMonthP = payments.filter((p) => { const t = new Date(p.datePaid).getTime(); return t >= lastMonthStart && t < monthStart; });
  const monthCountDelta = thisMonthP.length - lastMonthP.length;
  const thisMonthAmt = thisMonthP.reduce((s, p) => s + p.amount, 0);
  const lastMonthAmt = lastMonthP.reduce((s, p) => s + p.amount, 0);
  const amtPct = lastMonthAmt > 0 ? Math.round(((thisMonthAmt - lastMonthAmt) / lastMonthAmt) * 100) : (thisMonthAmt > 0 ? 100 : 0);

  const kpis = [
    { icon: AlertTriangle, color: '#EF4444', label: 'Unverified', value: String(unverifiedCount), delta: weekDelta, pct: false, sub: `${weekDelta >= 0 ? '+' : ''}${weekDelta} vs last week` },
    { icon: Clock, color: '#0EA5E9', label: 'This Month', value: String(thisMonthP.length), delta: monthCountDelta, pct: false, sub: `${monthCountDelta >= 0 ? '+' : ''}${monthCountDelta} vs last month` },
    { icon: CheckCircle2, color: '#16A34A', label: 'Verified', value: String(verifiedCount), delta: weekDelta, pct: false, sub: `${weekDelta >= 0 ? '+' : ''}${weekDelta} vs last week` },
    { icon: TrendingUp, color: '#4F46E5', label: 'Total Collected', value: fmt(summary?.collected ?? totalCollected), delta: amtPct, pct: true, sub: 'all time' },
  ];

  // ── Monthly trend (12 months) ──
  const monthlyData = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const target = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const inM = (p: Payment) => { const d = new Date(p.datePaid); return d.getMonth() === target.getMonth() && d.getFullYear() === target.getFullYear(); };
    const inMonth = payments.filter(inM);
    return { month: MONTHS[target.getMonth()], count: inMonth.length, amount: inMonth.reduce((s, p) => s + p.amount, 0) };
  }), [payments]); // eslint-disable-line react-hooks/exhaustive-deps
  const peakMonth = monthlyData.reduce((a, b) => (b.count > a.count ? b : a), monthlyData[0]);

  // ── Filter + paginate ──
  const filtered = useMemo(() => {
    let rows = payments;
    if (tab === 'verified') rows = rows.filter((p) => p.verified);
    else if (tab === 'unverified') rows = rows.filter((p) => !p.verified);
    if (typeFilter !== 'all') rows = rows.filter((p) => p.type === typeFilter);
    if (timeframe !== 'all') rows = rows.filter((p) => {
      const t = new Date(p.datePaid).getTime();
      if (timeframe === 'week') return Date.now() - t < week;
      if (timeframe === 'month') return t >= monthStart;
      if (timeframe === 'year') return new Date(p.datePaid).getFullYear() === now.getFullYear();
      return true;
    });
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((p) => `${p.referenceNo ?? ''} ${p.bill?.referenceNo ?? ''} ${clientName(p.bill?.client)}`.toLowerCase().includes(q));
    }
    return rows;
  }, [payments, tab, typeFilter, timeframe, search]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectCls = 'h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[13px] text-[#374151] outline-none focus:border-[#4F46E5] cursor-pointer';
  const th = 'px-4 py-3 text-left text-[13px] font-medium text-[#94A3B8]';

  return (
    <div className="min-h-full py-8" style={{ background: '#F8FAFC' }}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[32px] font-extrabold leading-none tracking-tight text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>Payments</h1>
        <button onClick={() => router.push('/billing')} className="flex items-center gap-1.5 rounded-[10px] px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#4338CA]" style={{ background: '#4F46E5' }}><Plus size={16} /> Record Payment</button>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ icon: Icon, color, label, value, delta, pct, sub }) => (
          <div key={label} className={`${CARD} px-6 py-5`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon size={20} color={color} />
                <span className="text-[13px] font-medium text-[#64748B]">{label}</span>
              </div>
              <DeltaPill n={delta} pct={pct} />
            </div>
            <div className="mt-2 text-[48px] font-extrabold leading-none text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif', letterSpacing: '-0.03em' }}>{value}</div>
            <div className="mt-1.5 text-[13px] text-[#94A3B8]">{sub}</div>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <div className={`${CARD} mb-6 p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[18px] font-semibold text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>Payment Trends</span>
          <button onClick={() => setPeriod((p) => (p === 'Yearly' ? 'Monthly' : 'Yearly'))} className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-[13px] font-medium text-[#374151]">{period} <ChevronDown size={14} /></button>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={monthlyData} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#F1F5F9" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94A3B8' }} dy={6} />
            <YAxis hide />
            {peakMonth && peakMonth.count > 0 && <ReferenceLine x={peakMonth.month} stroke="#4F46E5" strokeDasharray="4 4" />}
            <Tooltip cursor={{ stroke: '#E2E8F0' }} content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              return (
                <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>Total Payments</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>{payload[0]?.value}</div>
                  <div style={{ fontSize: 12, color: '#4F46E5', fontWeight: 600 }}>{fmt(payload[0]?.payload?.amount)}</div>
                </div>
              );
            }} />
            <Area type="monotone" dataKey="count" stroke="#4F46E5" strokeWidth={2.5} fill="url(#payGrad)" activeDot={{ r: 5, fill: '#4F46E5', stroke: '#fff', strokeWidth: 2 }} isAnimationActive animationDuration={800} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Payments table section */}
      <div>
        <div className="mb-1 text-[24px] font-bold text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>Payments</div>
        <p className="mb-4 text-[14px] text-[#64748B]">Manage payment records and verify transactions.</p>

        {/* Tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {([['all', 'All', payments.length], ['unverified', 'Unverified', unverifiedCount], ['verified', 'Verified', verifiedCount]] as const).map(([v, l, n]) => (
            <button key={v} onClick={() => { setTab(v); setPage(1); }} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors"
              style={tab === v ? { background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE' } : { background: 'transparent', color: '#64748B', border: '1px solid transparent' }}>
              <Settings size={14} /> {l} ({n})
            </button>
          ))}
        </div>

        <div className={`${CARD} p-5`}>
          {/* Filter row */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="all">All Types</option><option value="Cash">Cash</option><option value="Cheque">Cheque</option><option value="CreditCard">Credit Card</option><option value="DebitCard">Debit Card</option><option value="BankTransfer">Bank Transfer</option><option value="Other">Other</option>
            </select>
            <select value={tab} onChange={(e) => { setTab(e.target.value as any); setPage(1); }} className={selectCls}>
              <option value="all">All Status</option><option value="verified">Verified</option><option value="unverified">Unverified</option>
            </select>
            <select value={timeframe} onChange={(e) => { setTimeframe(e.target.value); setPage(1); }} className={selectCls}>
              <option value="all">All Time</option><option value="week">This Week</option><option value="month">This Month</option><option value="year">This Year</option>
            </select>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex h-9 w-[240px] items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3.5 text-[#9CA3AF]">
                <Search size={15} />
                <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search Bill# or Client…" className="w-full border-none bg-transparent text-[13px] text-[#0F172A] outline-none placeholder:text-[#9CA3AF]" />
              </div>
              <button className="flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[13px] font-medium text-[#374151]"><SlidersHorizontal size={14} /> Filter</button>
            </div>
          </div>

          {/* Table */}
          {pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <DollarSign size={48} className="text-[#E2E8F0]" />
              <div className="text-[14px] font-medium text-[#94A3B8]">No payments found</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#F1F5F9]">
                    {['Bill#', 'Client', 'Amount', 'Type', 'Status', 'Report Time', 'By', 'Actions'].map((h, i) => (
                      <th key={h} className={`${th} ${i === 2 ? 'text-right' : ''}`}><span className="inline-flex items-center gap-1">{h} <SortIcon /></span></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => {
                    const b = badgeFor(p.type);
                    return (
                      <tr key={p.id} className="border-b border-[#F8FAFC] transition-colors hover:bg-[#F9FAFB]">
                        <td className="whitespace-nowrap px-4 py-3.5"><span className="font-mono text-[13px] font-bold text-[#0F172A]">{p.bill?.referenceNo ?? p.billId.slice(-8)}</span></td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">{clientName(p.bill?.client)}</td>
                        <td className="px-4 py-3.5 text-right text-[14px] font-bold text-[#0F172A]">{fmt(p.amount)}</td>
                        <td className="px-4 py-3.5"><span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: b.bg, color: b.fg }}>{typeLabel(p.type)}</span></td>
                        <td className="px-4 py-3.5">
                          {p.verified
                            ? <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: '#F0FDF4', color: '#16A34A' }}><CheckCircle2 size={13} /> Verified</span>
                            : <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: '#FFF9F0', color: '#92400E' }}><Clock size={13} /> Pending</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">{relTime(p.datePaid)}</td>
                        <td className="px-4 py-3.5 text-[13px] text-[#64748B]">Recorded</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button title="Download receipt" className="grid h-8 w-8 place-items-center rounded-full border border-[#E2E8F0] text-[#64748B] transition-colors hover:bg-[#F5F7FF]"><Download size={14} /></button>
                            <button title="Open bill" onClick={() => router.push('/billing')} className="grid h-8 w-8 place-items-center rounded-full border border-[#E2E8F0] text-[#64748B] transition-colors hover:bg-[#F5F7FF] hover:text-[#4F46E5]"><ExternalLink size={14} /></button>
                            <button title={p.verified ? 'Verified' : 'Verify payment'} disabled={p.verified || verify.isPending} onClick={() => verify.mutate(p.id)} className="grid h-8 w-8 place-items-center rounded-full border border-[#E2E8F0] transition-colors hover:bg-[#F5F7FF]" style={{ color: p.verified ? '#CBD5E1' : '#4F46E5', cursor: p.verified ? 'default' : 'pointer' }}><CheckCircle2 size={14} /></button>
                            <div className="relative">
                              <button title="More" onClick={() => setMenuId(menuId === p.id ? null : p.id)} className="grid h-8 w-8 place-items-center rounded-full border border-[#E2E8F0] text-[#64748B] transition-colors hover:bg-[#F5F7FF]"><MoreHorizontal size={14} /></button>
                              {menuId === p.id && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                                  <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-[#EEF2F7] bg-white py-1 shadow-lg">
                                    <button onClick={() => { setMenuId(null); router.push('/billing'); }} className="block w-full px-4 py-2 text-left text-[13px] text-[#374151] hover:bg-[#F5F7FF]">View Bill</button>
                                    <button onClick={() => { setMenuId(null); navigator.clipboard?.writeText(p.referenceNo ?? p.bill?.referenceNo ?? ''); notify('Reference copied'); }} className="block w-full px-4 py-2 text-left text-[13px] text-[#374151] hover:bg-[#F5F7FF]">Copy Reference No.</button>
                                  </div>
                                </>
                              )}
                            </div>
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
            <div className="mt-4 flex items-center justify-end gap-2">
              <button disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="grid h-9 w-9 place-items-center rounded-full border border-[#EEF2F7] text-[#6B7280] disabled:opacity-40 hover:bg-[#F5F7FF]"><ChevronLeft size={16} /></button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, safePage - 3), safePage + 2).map((n) => (
                <button key={n} onClick={() => setPage(n)} className="grid h-9 min-w-9 place-items-center rounded-full px-2 text-[13px] font-bold" style={{ background: n === safePage ? '#EEF3FF' : 'transparent', color: n === safePage ? '#4F46E5' : '#6B7280' }}>{n}</button>
              ))}
              <button disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="grid h-9 w-9 place-items-center rounded-full border border-[#EEF2F7] text-[#6B7280] disabled:opacity-40 hover:bg-[#F5F7FF]"><ChevronRight size={16} /></button>
            </div>
          )}
        </div>
      </div>

      {toast && <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: '#16A34A' }}>{toast}</div>}
    </div>
  );
}
