'use client';

import { useState } from 'react';
import {
  Bar, BarChart, Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Check, Clock, Droplet, FlaskConical, Filter, Plus, ScanLine, TestTube, TrendingUp } from 'lucide-react';

// ── Palette (zero-orange: indigo / teal / emerald / slate only) ──────────────
const INDIGO = '#4F46E5', INDIGO_LT = '#A5B4FC', TEAL = '#0D9488', EMERALD = '#10B981', SLATE = '#94A3B8';
const CARD = 'bg-white rounded-2xl border border-gray-100 p-6 shadow-sm';

// ── Seeded data (matches the reference; monthly/financial breakdowns are not
//    yet exposed by /analytics/home, so these are placeholders ready to wire). ──
const VOLUME = [
  { m: 'Jan', gyn: 150, nongyn: 74 }, { m: 'Feb', gyn: 120, nongyn: 60 },
  { m: 'Mar', gyn: 130, nongyn: 66 }, { m: 'Apr', gyn: 140, nongyn: 82 },
  { m: 'May', gyn: 145, nongyn: 70 }, { m: 'Jun', gyn: 139, nongyn: 72 },
]; // sums to 1,248
const VOLUME_TOTAL = VOLUME.reduce((s, r) => s + r.gyn + r.nongyn, 0); // 1,248
const VOLUME_AVG = Math.round(VOLUME.reduce((s, r) => s + r.gyn + r.nongyn, 0) / VOLUME.length);

const PRACTICE = [
  { label: 'Total Cases', value: '135', Icon: FlaskConical },
  { label: 'Total Authorized', value: '89', Icon: Check },
  { label: 'Avg TAT', value: '2.4d', Icon: Clock },
];
const BREAKDOWN = [
  { label: 'Cervical Scrape', pct: 42, count: 567, color: INDIGO },
  { label: 'Breast Aspirate', pct: 24, count: 324, color: TEAL },
  { label: 'Urine Cytology', pct: 18, count: 243, color: EMERALD },
];

const CONVERSION = [
  { m: 'Jan', authorized: 118, pending: 34 }, { m: 'Feb', authorized: 142, pending: 46 },
  { m: 'Mar', authorized: 120, pending: 30 }, { m: 'Apr', authorized: 96, pending: 40 },
  { m: 'May', authorized: 108, pending: 32 }, { m: 'Jun', authorized: 78, pending: 22 },
  { m: 'Jul', authorized: 92, pending: 28 }, { m: 'Aug', authorized: 128, pending: 36 },
];

const DISTRIBUTION = [
  { label: 'Cervical Scrape', specimens: 567, pct: 42, color: INDIGO, Icon: ScanLine },
  { label: 'Breast Aspirate', specimens: 324, pct: 31, color: TEAL, Icon: TestTube },
  { label: 'Urine Cytology', specimens: 243, pct: 18, color: EMERALD, Icon: FlaskConical },
  { label: 'Body Fluid', specimens: 114, pct: 11, color: SLATE, Icon: Droplet },
];

const REVENUE = [
  { m: 'Jan', revenue: 720 }, { m: 'Feb', revenue: 640 }, { m: 'Mar', revenue: 910 },
  { m: 'Apr', revenue: 1180 }, { m: 'May', revenue: 1040 }, { m: 'Jun', revenue: 1320 },
  { m: 'Jul', revenue: 1210 }, { m: 'Aug', revenue: 1450 }, { m: 'Sep', revenue: 1380 },
  { m: 'Oct', revenue: 1290 }, { m: 'Nov', revenue: 1160 }, { m: 'Dec', revenue: 1279 },
];
const TOP_SERVICES = [
  { name: 'Cervical Scrape', amount: 8234 },
  { name: 'Breast Aspirate', amount: 2847 },
  { name: 'Urine Cytology', amount: 1498 },
];

const TABS = ['Overview', 'Clinical', 'Specimens', 'Financial', 'Patients'] as const;
const usd = (n: number) => `$${n.toLocaleString()}`;

function GrowthBadge({ pct }: { pct: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
      <TrendingUp size={11} /> {pct}%
    </span>
  );
}

function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-semibold text-gray-900">{label}</div>
      <div className="text-[#4F46E5]">Revenue: {usd(payload[0].value)}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Overview');
  const [revPeriod, setRevPeriod] = useState<'Monthly' | 'Quarterly' | 'Yearly'>('Monthly');

  return (
    <div className="pb-10 pt-4">
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500">Laboratory performance overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {tab}
            </button>
          ))}
          <button className="ml-1 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Monthly <span className="text-gray-400">▾</span>
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            <Filter size={14} /> Filter
          </button>
        </div>
      </div>

      {activeTab !== 'Overview' ? (
        <div className={`${CARD} flex items-center justify-center py-24 text-sm text-gray-500`}>
          {activeTab} analytics — coming soon.
        </div>
      ) : (
        <>
          {/* ── TOP SECTION ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left — Monthly Specimen Volume */}
            <div className={CARD}>
              <div className="mb-4 flex items-start justify-between">
                <span className="text-lg font-bold text-gray-900">Monthly Specimen Volume</span>
                <div className="text-right">
                  <div className="text-xs font-medium text-gray-400">6 months</div>
                  <div className="text-2xl font-black text-gray-900">{VOLUME_TOTAL.toLocaleString()}</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={VOLUME} barGap={4} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94A3B8' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94A3B8' }} width={32} />
                  <Tooltip cursor={{ fill: 'rgba(79,70,229,0.05)' }} contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }} />
                  <ReferenceLine y={VOLUME_AVG} stroke="#94A3B8" strokeDasharray="4 4" />
                  <Bar dataKey="gyn" name="GYN" fill={INDIGO} radius={[6, 6, 0, 0]} maxBarSize={16} />
                  <Bar dataKey="nongyn" name="NON-GYN" fill={INDIGO_LT} radius={[6, 6, 0, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>

              {/* Practice Overview */}
              <div className="mt-5 border-t border-gray-100 pt-5">
                <div className="mb-4 text-sm font-bold text-gray-900">Practice Overview</div>
                <div className="grid grid-cols-3 gap-3">
                  {PRACTICE.map(({ label, value, Icon }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-gray-200 text-gray-500">
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs text-gray-500">{label}</div>
                        <div className="text-lg font-black text-gray-900">{value}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Breakdown bars */}
                <div className="mt-5 space-y-3">
                  {BREAKDOWN.map(({ label, pct, count, color }) => (
                    <div key={label}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-600">{label}</span>
                        <span className="font-semibold text-gray-900">{pct}% / {count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-6">
              {/* Case Conversion Rate */}
              <div className={CARD}>
                <div className="mb-4 flex items-start justify-between gap-4">
                  <span className="text-lg font-bold text-gray-900">Case Conversion Rate</span>
                  <div className="flex items-start gap-3">
                    <div>
                      <div className="text-xs text-gray-500">New Cases</div>
                      <div className="flex items-center gap-2">
                        <span className="text-3xl font-black text-gray-900">2,847</span>
                        <GrowthBadge pct={24} />
                      </div>
                    </div>
                    <div className="rounded-xl bg-gray-900 p-4 text-white">
                      <div className="flex items-center gap-2 text-xs text-white/70"><Clock size={12} /> Growth</div>
                      <div className="mt-1 text-xl font-black">+12%</div>
                    </div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={CONVERSION} barCategoryGap="30%">
                    <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94A3B8' }} />
                    <Tooltip cursor={{ fill: 'rgba(79,70,229,0.05)' }} contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }} />
                    <Bar dataKey="authorized" name="Authorized" stackId="c" fill={INDIGO} radius={[0, 0, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="pending" name="Received" stackId="c" fill={INDIGO_LT} radius={[6, 6, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Specimen Type Distribution */}
              <div className={CARD}>
                <div className="mb-4 text-lg font-bold text-gray-900">Specimen Type Distribution</div>
                <div className="space-y-4">
                  {DISTRIBUTION.map(({ label, specimens, pct, color, Icon }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1A`, color }}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-900">{label}</span>
                          <span className="text-sm font-bold text-gray-900">{pct}%</span>
                        </div>
                        <div className="mb-1.5 text-xs text-gray-500">{specimens} specimens</div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── BOTTOM SECTION: Revenue ── */}
          <div className={`${CARD} mt-6`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-gray-500">Total Revenue</div>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-4xl font-black text-gray-900">$12,579</span>
                  <GrowthBadge pct={8} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
                  {(['Monthly', 'Quarterly', 'Yearly'] as const).map((p) => (
                    <button key={p} onClick={() => setRevPeriod(p)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${revPeriod === p ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                      {p}
                    </button>
                  ))}
                </div>
                <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"><Filter size={14} /> Filter</button>
                <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"><Plus size={14} /> Add widget</button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
              {/* Revenue trend */}
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={REVENUE} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={INDIGO} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={INDIGO} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94A3B8' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94A3B8' }} width={44} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<RevenueTooltip />} cursor={{ stroke: INDIGO, strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="revenue" stroke={INDIGO} strokeWidth={2.5} fill="url(#revFill)" dot={{ r: 3, fill: INDIGO }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>

              {/* Top Services */}
              <div className="rounded-xl border border-gray-100 bg-[#FAFBFF] p-5">
                <div className="mb-4 text-base font-bold text-gray-900">Top Services</div>
                <div className="space-y-4">
                  {TOP_SERVICES.map((s) => (
                    <div key={s.name}>
                      <div className="text-sm text-gray-500">{s.name}</div>
                      <div className="text-2xl font-black text-gray-900">{usd(s.amount)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
