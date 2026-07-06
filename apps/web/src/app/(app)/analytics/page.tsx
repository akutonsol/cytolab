'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar, BarChart, Area, AreaChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Calendar, Check, ChevronDown, Clock, Droplet, FlaskConical, Filter, Plus, ScanLine, SlidersHorizontal, TestTube, TrendingUp } from 'lucide-react';

// ── Palette (zero-orange: indigo / teal / emerald / slate only) ──────────────
const INDIGO = '#4F46E5', INDIGO_LT = '#A5B4FC', TEAL = '#0D9488', EMERALD = '#10B981', SLATE = '#94A3B8';
const CARD = 'bg-white rounded-2xl border border-gray-100 p-6 shadow-sm';

// ── Seeded data (matches the reference; monthly/financial breakdowns are not
//    yet exposed by /analytics/home, so these are placeholders ready to wire). ──
const VOLUME = [
  { m: 'Jan', gyn: 150, nongyn: 74 }, { m: 'Feb', gyn: 120, nongyn: 60 },
  { m: 'Mar', gyn: 130, nongyn: 66 }, { m: 'Apr', gyn: 140, nongyn: 82 },
  { m: 'May', gyn: 145, nongyn: 70 }, { m: 'Jun', gyn: 139, nongyn: 72 },
]; // Monthly (default); Weekly/Quarterly/Yearly variants below drive the period selector.

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

// ── Period selector datasets (header "Monthly" dropdown) ─────────────────────
const weeklyVolume = [
  { m: 'Mon', gyn: 24, nongyn: 13 }, { m: 'Tue', gyn: 31, nongyn: 16 }, { m: 'Wed', gyn: 28, nongyn: 14 },
  { m: 'Thu', gyn: 35, nongyn: 18 }, { m: 'Fri', gyn: 30, nongyn: 15 }, { m: 'Sat', gyn: 18, nongyn: 9 }, { m: 'Sun', gyn: 12, nongyn: 6 },
];
const quarterlyVolume = [
  { m: 'Q1', gyn: 400, nongyn: 220 }, { m: 'Q2', gyn: 424, nongyn: 224 }, { m: 'Q3', gyn: 388, nongyn: 210 }, { m: 'Q4', gyn: 412, nongyn: 236 },
];
const yearlyVolume = [
  { m: '2023', gyn: 1420, nongyn: 780 }, { m: '2024', gyn: 1560, nongyn: 880 }, { m: '2025', gyn: 1680, nongyn: 940 },
];
const weeklyConversion = [
  { m: 'Mon', authorized: 22, pending: 8 }, { m: 'Tue', authorized: 28, pending: 9 }, { m: 'Wed', authorized: 25, pending: 7 },
  { m: 'Thu', authorized: 31, pending: 10 }, { m: 'Fri', authorized: 27, pending: 8 }, { m: 'Sat', authorized: 15, pending: 5 }, { m: 'Sun', authorized: 10, pending: 4 },
];
const quarterlyConversion = [
  { m: 'Q1', authorized: 380, pending: 110 }, { m: 'Q2', authorized: 412, pending: 96 }, { m: 'Q3', authorized: 366, pending: 104 }, { m: 'Q4', authorized: 398, pending: 118 },
];
const yearlyConversion = [
  { m: '2023', authorized: 1320, pending: 380 }, { m: '2024', authorized: 1480, pending: 360 }, { m: '2025', authorized: 1560, pending: 420 },
];
const PERIOD_LABEL = { Weekly: '7 days', Monthly: '6 months', Quarterly: '4 quarters', Yearly: '3 years' } as const;

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

// ── Shared chart chrome ──────────────────────────────────────────────────────
const INDIGO_100 = '#E0E7FF';
const AX = { fontSize: 11, fill: '#94A3B8' } as const;
const TIP = { borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 } as const;
const CUR = { fill: 'rgba(79,70,229,0.05)' } as const;

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="mb-4 text-sm text-gray-500">{subtitle ?? ''}</p>
      {children}
    </div>
  );
}

function BigStatCard({ title, subtitle, value, delta, data, dataKey }: { title: string; subtitle: string; value: string; delta: number; data: any[]; dataKey: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500">{subtitle}</p>
      <div className="my-4 flex items-baseline gap-2">
        <span className="text-4xl font-black text-gray-900">{value}</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-sm font-semibold text-emerald-700">↑ {delta}%</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="month" tick={AX} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TIP} />
          <Area type="monotone" dataKey={dataKey} stroke={INDIGO} fill="#EEF2FF" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══ CLINICAL ════════════════════════════════════════════════════════════════
const bethesdaData = [
  { category: 'NILM', count: 892 }, { category: 'ASC-US', count: 124 }, { category: 'LSIL', count: 67 },
  { category: 'ASC-H', count: 34 }, { category: 'HSIL', count: 28 }, { category: 'AGC', count: 12 }, { category: 'Malignant', count: 8 },
];
const abnormalTrendData = [
  { month: 'Jan', rate: 8.2, benchmark: 7.5 }, { month: 'Feb', rate: 7.8, benchmark: 7.5 }, { month: 'Mar', rate: 9.1, benchmark: 7.5 },
  { month: 'Apr', rate: 8.5, benchmark: 7.5 }, { month: 'May', rate: 7.9, benchmark: 7.5 }, { month: 'Jun', rate: 8.8, benchmark: 7.5 },
];
const tatData = [
  { type: 'Cervical Scrape', avg: 2.1, target: 3.0 }, { type: 'Breast Aspirate', avg: 2.8, target: 3.0 },
  { type: 'Urine Cytology', avg: 1.9, target: 2.5 }, { type: 'Body Fluid', avg: 3.2, target: 3.0 }, { type: 'Endocervical', avg: 2.4, target: 3.0 },
];
const authRateData = [
  { month: 'Jan', rate: 80 }, { month: 'Feb', rate: 81 }, { month: 'Mar', rate: 82 },
  { month: 'Apr', rate: 83 }, { month: 'May', rate: 83 }, { month: 'Jun', rate: 84 },
];

function ClinicalTab() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ChartCard title="Bethesda Classification" subtitle="TBS 2014 category distribution">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={bethesdaData} margin={{ top: 4, right: 8, left: 0, bottom: 12 }}>
            <CartesianGrid vertical={false} stroke="#F1F5F9" />
            <XAxis dataKey="category" tick={AX} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={44} />
            <YAxis tick={AX} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={TIP} cursor={CUR} />
            <Bar dataKey="count" fill={INDIGO} radius={[4, 4, 0, 0]} maxBarSize={34} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Abnormal Detection Rate" subtitle="Monthly abnormal findings trend (%)">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={abnormalTrendData}>
            <CartesianGrid vertical={false} stroke="#F1F5F9" />
            <XAxis dataKey="month" tick={AX} tickLine={false} axisLine={false} />
            <YAxis tick={AX} tickLine={false} axisLine={false} width={36} />
            <Tooltip contentStyle={TIP} />
            <Line type="monotone" dataKey="rate" name="Abnormal rate" stroke={INDIGO} strokeWidth={2.5} dot={{ r: 3, fill: INDIGO }} />
            <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="#CBD5E1" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Turnaround Time Performance" subtitle="Average TAT vs target by specimen type (days)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={tatData} layout="vertical" margin={{ left: 8, right: 12 }}>
            <CartesianGrid horizontal={false} stroke="#F1F5F9" />
            <XAxis type="number" tick={AX} tickLine={false} axisLine={false} unit="d" />
            <YAxis dataKey="type" type="category" tick={AX} tickLine={false} axisLine={false} width={110} />
            <Tooltip contentStyle={TIP} cursor={CUR} />
            <Bar dataKey="avg" name="Avg TAT" fill={INDIGO} radius={[0, 4, 4, 0]} maxBarSize={12} />
            <Bar dataKey="target" name="Target" fill={INDIGO_100} radius={[0, 4, 4, 0]} maxBarSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <BigStatCard title="Authorization Rate" subtitle="Monthly authorization performance" value="84%" delta={2} data={authRateData} dataKey="rate" />
    </div>
  );
}

// ═══ SPECIMENS ═══════════════════════════════════════════════════════════════
const specVolumeByType = [
  { type: 'Cervical', count: 567 }, { type: 'Breast', count: 324 }, { type: 'Urine', count: 243 },
  { type: 'Body Fluid', count: 114 }, { type: 'Endocervical', count: 98 }, { type: 'Sputum', count: 62 },
];
const statusPipeline = [
  { stage: 'Received', count: 1248 }, { stage: 'Screening', count: 412 }, { stage: 'Resulted', count: 356 },
  { stage: 'Authorized', count: 298 }, { stage: 'Released', count: 276 },
];
const clientSource = [
  { client: 'Kingston Medical', count: 312 }, { client: 'St. Andrew Clinic', count: 248 }, { client: 'Montego Health', count: 186 },
  { client: 'Spanish Town Lab', count: 142 }, { client: 'Mandeville Clinic', count: 98 },
];
const processingTime = [
  { type: 'Cervical', hours: 18 }, { type: 'Breast', hours: 26 }, { type: 'Urine', hours: 14 },
  { type: 'Body Fluid', hours: 30 }, { type: 'Endocervical', hours: 20 },
];

function SpecimensTab() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ChartCard title="Specimen Volume by Type" subtitle="Total specimens processed (6 months)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={specVolumeByType}>
            <CartesianGrid vertical={false} stroke="#F1F5F9" />
            <XAxis dataKey="type" tick={AX} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={44} />
            <YAxis tick={AX} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={TIP} cursor={CUR} />
            <Bar dataKey="count" fill={TEAL} radius={[4, 4, 0, 0]} maxBarSize={34} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Specimen Status Pipeline" subtitle="Current distribution across the workflow">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={statusPipeline} layout="vertical" margin={{ left: 8, right: 12 }}>
            <CartesianGrid horizontal={false} stroke="#F1F5F9" />
            <XAxis type="number" tick={AX} tickLine={false} axisLine={false} />
            <YAxis dataKey="stage" type="category" tick={AX} tickLine={false} axisLine={false} width={90} />
            <Tooltip contentStyle={TIP} cursor={CUR} />
            <Bar dataKey="count" fill={INDIGO} radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Client Source Distribution" subtitle="Referring clients by specimen count">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={clientSource} layout="vertical" margin={{ left: 8, right: 12 }}>
            <CartesianGrid horizontal={false} stroke="#F1F5F9" />
            <XAxis type="number" tick={AX} tickLine={false} axisLine={false} />
            <YAxis dataKey="client" type="category" tick={AX} tickLine={false} axisLine={false} width={120} />
            <Tooltip contentStyle={TIP} cursor={CUR} />
            <Bar dataKey="count" fill={EMERALD} radius={[0, 4, 4, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Processing Time by Type" subtitle="Average hours in processing">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={processingTime}>
            <CartesianGrid vertical={false} stroke="#F1F5F9" />
            <XAxis dataKey="type" tick={AX} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={44} />
            <YAxis tick={AX} tickLine={false} axisLine={false} width={40} unit="h" />
            <Tooltip contentStyle={TIP} cursor={CUR} />
            <Bar dataKey="hours" fill={INDIGO} radius={[4, 4, 0, 0]} maxBarSize={34} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ═══ FINANCIAL ═══════════════════════════════════════════════════════════════
const revenueByClient = [
  { client: 'Kingston Medical', revenue: 4120 }, { client: 'St. Andrew Clinic', revenue: 2980 }, { client: 'Montego Health', revenue: 2140 },
  { client: 'Spanish Town Lab', revenue: 1620 }, { client: 'Mandeville Clinic', revenue: 980 },
];
const outstandingPayments = [
  { month: 'Jan', amount: 1420 }, { month: 'Feb', amount: 1180 }, { month: 'Mar', amount: 1360 },
  { month: 'Apr', amount: 980 }, { month: 'May', amount: 1120 }, { month: 'Jun', amount: 860 },
];
const servicesRevenue = [
  { service: 'Cervical Scrape', revenue: 8234 }, { service: 'Breast Aspirate', revenue: 2847 },
  { service: 'Urine Cytology', revenue: 1498 }, { service: 'Body Fluid', revenue: 640 },
];
const revenueVsTarget = [
  { month: 'Jan', revenue: 1720, target: 1800 }, { month: 'Feb', revenue: 1640, target: 1800 }, { month: 'Mar', revenue: 1910, target: 1800 },
  { month: 'Apr', revenue: 2180, target: 2000 }, { month: 'May', revenue: 2040, target: 2000 }, { month: 'Jun', revenue: 2320, target: 2000 },
];

function FinancialTab() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ChartCard title="Revenue by Client" subtitle="Top referring clients (JMD $)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={revenueByClient} layout="vertical" margin={{ left: 8, right: 12 }}>
            <CartesianGrid horizontal={false} stroke="#F1F5F9" />
            <XAxis type="number" tick={AX} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
            <YAxis dataKey="client" type="category" tick={AX} tickLine={false} axisLine={false} width={120} />
            <Tooltip contentStyle={TIP} cursor={CUR} formatter={(v: any) => usd(Number(v))} />
            <Bar dataKey="revenue" fill={INDIGO} radius={[0, 4, 4, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Outstanding Payments" subtitle="Unpaid balance trend (JMD $)">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={outstandingPayments} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TEAL} stopOpacity={0.22} />
                <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#F1F5F9" />
            <XAxis dataKey="month" tick={AX} tickLine={false} axisLine={false} />
            <YAxis tick={AX} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `$${v}`} />
            <Tooltip contentStyle={TIP} formatter={(v: any) => usd(Number(v))} />
            <Area type="monotone" dataKey="amount" stroke={TEAL} strokeWidth={2.5} fill="url(#outFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Services Revenue" subtitle="Revenue by service (JMD $)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={servicesRevenue}>
            <CartesianGrid vertical={false} stroke="#F1F5F9" />
            <XAxis dataKey="service" tick={AX} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis tick={AX} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `$${v}`} />
            <Tooltip contentStyle={TIP} cursor={CUR} formatter={(v: any) => usd(Number(v))} />
            <Bar dataKey="revenue" fill={EMERALD} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Monthly Revenue vs Target" subtitle="Actual revenue against monthly target">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={revenueVsTarget} barGap={4}>
            <CartesianGrid vertical={false} stroke="#F1F5F9" />
            <XAxis dataKey="month" tick={AX} tickLine={false} axisLine={false} />
            <YAxis tick={AX} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `$${v}`} />
            <Tooltip contentStyle={TIP} cursor={CUR} formatter={(v: any) => usd(Number(v))} />
            <Bar dataKey="revenue" name="Revenue" fill={INDIGO} radius={[4, 4, 0, 0]} maxBarSize={16} />
            <Bar dataKey="target" name="Target" fill={INDIGO_100} radius={[4, 4, 0, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ═══ PATIENTS ════════════════════════════════════════════════════════════════
const registrationTrend = [
  { month: 'Jan', count: 214 }, { month: 'Feb', count: 198 }, { month: 'Mar', count: 242 },
  { month: 'Apr', count: 268 }, { month: 'May', count: 251 }, { month: 'Jun', count: 289 },
];
const ageDistribution = [
  { range: '<20', count: 42 }, { range: '20-29', count: 186 }, { range: '30-39', count: 312 },
  { range: '40-49', count: 264 }, { range: '50-59', count: 148 }, { range: '60+', count: 96 },
];
const recallComplianceData = [
  { month: 'Jan', rate: 82 }, { month: 'Feb', rate: 84 }, { month: 'Mar', rate: 85 },
  { month: 'Apr', rate: 86 }, { month: 'May', rate: 87 }, { month: 'Jun', rate: 88 },
];
const referringDoctors = [
  { doctor: 'Dr. Campbell', cases: 142 }, { doctor: 'Dr. Reid', cases: 118 }, { doctor: 'Dr. Blake', cases: 96 },
  { doctor: 'Dr. Grant', cases: 74 }, { doctor: 'Dr. Johnson', cases: 58 },
];

function PatientsTab() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ChartCard title="Patient Registration" subtitle="New patient registrations per month">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={registrationTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="regFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={INDIGO} stopOpacity={0.22} />
                <stop offset="100%" stopColor={INDIGO} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#F1F5F9" />
            <XAxis dataKey="month" tick={AX} tickLine={false} axisLine={false} />
            <YAxis tick={AX} tickLine={false} axisLine={false} width={36} />
            <Tooltip contentStyle={TIP} />
            <Area type="monotone" dataKey="count" stroke={INDIGO} strokeWidth={2.5} fill="url(#regFill)" dot={{ r: 3, fill: INDIGO }} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Age Distribution" subtitle="Patients by age range">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={ageDistribution}>
            <CartesianGrid vertical={false} stroke="#F1F5F9" />
            <XAxis dataKey="range" tick={AX} tickLine={false} axisLine={false} />
            <YAxis tick={AX} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={TIP} cursor={CUR} />
            <Bar dataKey="count" fill={TEAL} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <BigStatCard title="Recall Compliance" subtitle="Patients returning within recall window" value="88%" delta={4} data={recallComplianceData} dataKey="rate" />

      <ChartCard title="Referring Doctor Performance" subtitle="Cases referred by top physicians">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={referringDoctors} layout="vertical" margin={{ left: 8, right: 12 }}>
            <CartesianGrid horizontal={false} stroke="#F1F5F9" />
            <XAxis type="number" tick={AX} tickLine={false} axisLine={false} />
            <YAxis dataKey="doctor" type="category" tick={AX} tickLine={false} axisLine={false} width={100} />
            <Tooltip contentStyle={TIP} cursor={CUR} />
            <Bar dataKey="cases" fill={INDIGO} radius={[0, 4, 4, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

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

  const [period, setPeriod] = useState<'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly'>('Monthly');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ specimenType: 'All', client: 'All', doctor: 'All', dateRange: 'Last 6 months' });
  const periodRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close either popover when clicking outside its own container.
  useEffect(() => {
    if (!periodOpen && !filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) setPeriodOpen(false);
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [periodOpen, filterOpen]);

  // Swap the Overview volume + conversion charts to the selected period's dataset.
  const chartData = useMemo(() => {
    switch (period) {
      case 'Weekly': return { volume: weeklyVolume, conversion: weeklyConversion };
      case 'Quarterly': return { volume: quarterlyVolume, conversion: quarterlyConversion };
      case 'Yearly': return { volume: yearlyVolume, conversion: yearlyConversion };
      default: return { volume: VOLUME, conversion: CONVERSION };
    }
  }, [period]);
  const volTotal = useMemo(() => chartData.volume.reduce((s, r) => s + r.gyn + r.nongyn, 0), [chartData]);
  const volAvg = Math.round(volTotal / chartData.volume.length);
  const activeFilterCount = Object.values(filters).filter((v) => v !== 'All' && v !== 'Last 6 months').length;

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
          {/* Period selector */}
          <div ref={periodRef} className="relative ml-1">
            <button
              onClick={() => { setPeriodOpen((o) => !o); setFilterOpen(false); }}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Calendar size={14} className="text-gray-400" />
              {period}
              <ChevronDown size={13} className={`text-gray-400 transition-transform ${periodOpen ? 'rotate-180' : ''}`} />
            </button>
            {periodOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                {(['Weekly', 'Monthly', 'Quarterly', 'Yearly'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setPeriod(p); setPeriodOpen(false); }}
                    className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                      period === p ? 'bg-indigo-50 font-semibold text-indigo-600' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter panel */}
          <div ref={filterRef} className="relative">
            <button
              onClick={() => { setFilterOpen((o) => !o); setPeriodOpen(false); }}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                activeFilterCount > 0 ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal size={14} />
              Filter
              {activeFilterCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-gray-100 bg-white p-5 shadow-lg">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">Filter Analytics</span>
                  <button
                    onClick={() => setFilters({ specimenType: 'All', client: 'All', doctor: 'All', dateRange: 'Last 6 months' })}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Reset all
                  </button>
                </div>
                <div className="mb-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Specimen Type</label>
                  <select
                    value={filters.specimenType}
                    onChange={(e) => setFilters((f) => ({ ...f, specimenType: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
                  >
                    {['All', 'Cervical Scrape', 'Breast Aspirate', 'Urine Cytology', 'Body Fluid', 'Endocervical Asp'].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Client</label>
                  <select
                    value={filters.client}
                    onChange={(e) => setFilters((f) => ({ ...f, client: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
                  >
                    {['All', 'Kingston Medical', 'Montego Diagnostics', 'Spanish Town Clinic', 'Ocho Rios Pathology'].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Date Range</label>
                  <select
                    value={filters.dateRange}
                    onChange={(e) => setFilters((f) => ({ ...f, dateRange: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
                  >
                    {['Last 30 days', 'Last 3 months', 'Last 6 months', 'Last 12 months', 'Year to date'].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => setFilterOpen(false)}
                  className="w-full rounded-xl bg-indigo-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                >
                  Apply Filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'Clinical' ? (
        <ClinicalTab />
      ) : activeTab === 'Specimens' ? (
        <SpecimensTab />
      ) : activeTab === 'Financial' ? (
        <FinancialTab />
      ) : activeTab === 'Patients' ? (
        <PatientsTab />
      ) : (
        <>
          {/* ── TOP SECTION ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left — Monthly Specimen Volume */}
            <div className={CARD}>
              <div className="mb-4 flex items-start justify-between">
                <span className="text-lg font-bold text-gray-900">Monthly Specimen Volume</span>
                <div className="text-right">
                  <div className="text-xs font-medium text-gray-400">{PERIOD_LABEL[period]}</div>
                  <div className="text-2xl font-black text-gray-900">{volTotal.toLocaleString()}</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData.volume} barGap={4} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94A3B8' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94A3B8' }} width={32} />
                  <Tooltip cursor={{ fill: 'rgba(79,70,229,0.05)' }} contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }} />
                  <ReferenceLine y={volAvg} stroke="#94A3B8" strokeDasharray="4 4" />
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
                  <BarChart data={chartData.conversion} barCategoryGap="30%">
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
