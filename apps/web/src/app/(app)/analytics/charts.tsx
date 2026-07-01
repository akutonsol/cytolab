'use client';

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart,
  ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CHART } from '@/components/ui';

const ACTUAL_BLUE = '#3b6cf5';
const ACTUAL_BLUE_CURRENT = '#2e5ce6';
const DEFICIT_GRAY = '#eef2f7';

const kfmt = (v: number) => {
  const a = Math.abs(v);
  return a >= 1000 ? `${Math.round(a / 100) / 10}k` : `${a}`;
};

/* ---- Diverging horizontal bars: actual (deep blue, right) vs deficit (light gray, left) ---- */
export function DivergingBars({ data, currentMonth, height = 460 }: { data: any[]; currentMonth: string; height?: number }) {
  const rows = data.map((d) => ({ ...d, negDeficit: -d.deficit }));
  const max = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.deficit)));

  const YTick = (props: any) => {
    const cur = props.payload.value === currentMonth;
    return (
      <text x={props.x - 6} y={props.y} dy={4} textAnchor="end" fontSize={12} fontWeight={cur ? 700 : 500} fill={cur ? ACTUAL_BLUE : CHART.axis}>
        {props.payload.value}
      </text>
    );
  };
  // Value labels INSIDE the bars (white on blue); fall back outside for short bars.
  const ActualLabel = (p: any) => {
    if (!p.value) return null;
    const inside = p.width > 34;
    const tx = inside ? p.x + p.width - 8 : p.x + p.width + 6;
    return <text x={tx} y={p.y + p.height / 2} dy={4} textAnchor={inside ? 'end' : 'start'} fontSize={12} fontWeight={600} fill={inside ? '#fff' : CHART.ink}>{p.value.toLocaleString()}</text>;
  };
  const DeficitLabel = (p: any) => {
    if (!p.value) return null;
    const inside = p.width > 40;
    const tx = inside ? p.x + 8 : p.x - 6;
    return <text x={tx} y={p.y + p.height / 2} dy={4} textAnchor={inside ? 'start' : 'end'} fontSize={11} fontWeight={500} fill="#94a3b8">{`-${p.value.toLocaleString()}`}</text>;
  };

  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart layout="vertical" data={rows} stackOffset="sign" margin={{ top: 8, right: 24, bottom: 8, left: 8 }} barCategoryGap="22%">
          <CartesianGrid horizontal={false} stroke={CHART.grid} />
          <XAxis type="number" domain={[-max, max]} tickFormatter={kfmt} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="month" width={40} tick={<YTick />} axisLine={false} tickLine={false} />
          <ReferenceLine x={0} stroke={CHART.track} />
          <Bar dataKey="negDeficit" stackId="a" fill={DEFICIT_GRAY} radius={[7, 0, 0, 7]} isAnimationActive={false} maxBarSize={26}>
            <LabelList dataKey="deficit" content={DeficitLabel} />
          </Bar>
          <Bar dataKey="actual" stackId="a" radius={[0, 7, 7, 0]} isAnimationActive={false} maxBarSize={26}>
            {rows.map((r, i) => <Cell key={i} fill={r.current ? ACTUAL_BLUE_CURRENT : ACTUAL_BLUE} />)}
            <LabelList dataKey="actual" content={ActualLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DualTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const vol = payload.find((p: any) => p.dataKey === 'volume')?.value;
  const rev = payload.find((p: any) => p.dataKey === 'revenue')?.value;
  return (
    <div style={{ background: CHART.ink, color: '#fff', borderRadius: 12, padding: '10px 12px', boxShadow: '0 8px 24px rgba(16,24,40,.18)' }}>
      <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: ACTUAL_BLUE }} /> Volume <span style={{ marginLeft: 'auto' }}>{vol}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, marginTop: 3 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: '#9ca3af' }} /> Revenue <span style={{ marginLeft: 'auto' }}>${kfmt(rev ?? 0)}</span>
      </div>
    </div>
  );
}

/* ---- Dual smooth area lines: volume (blue) vs revenue (ink) ---- */
export function DualAreaLine({ data, height = 300 }: { data: any[]; height?: number }) {
  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACTUAL_BLUE} stopOpacity={0.18} />
              <stop offset="100%" stopColor={ACTUAL_BLUE} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.ink} stopOpacity={0.08} />
              <stop offset="100%" stopColor={CHART.ink} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: CHART.axis }} dy={6} />
          <YAxis yAxisId="v" hide />
          <YAxis yAxisId="r" orientation="right" hide />
          <Tooltip content={<DualTooltip />} cursor={{ stroke: CHART.track, strokeDasharray: '4 4' }} />
          <Area yAxisId="r" type="monotone" dataKey="revenue" stroke={CHART.ink} strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />
          <Area yAxisId="v" type="monotone" dataKey="volume" stroke={ACTUAL_BLUE} strokeWidth={2.5} fill="url(#volGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---- Weekly TAT compliance: blue→green gradient line, delayed/on-time region bands ---- */
export function ComplianceLine({ week, height = 150 }: { week: any[]; height?: number }) {
  const data = week.map((w) => ({ day: w.day, pct: w.onTimePct ?? 0, has: w.total > 0 }));
  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 18, right: 8, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="compStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4f7df9" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <ReferenceArea x1="Mo" x2="We" fill="#eaf1ff" fillOpacity={0.6} />
          <ReferenceArea x1="Fr" x2="Su" fill="#dcfce7" fillOpacity={0.7} />
          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: CHART.axis }} dy={4} />
          <YAxis hide domain={[0, 100]} />
          <ReferenceLine y={50} stroke={CHART.track} strokeDasharray="3 3" />
          <Line type="monotone" dataKey="pct" stroke="url(#compStroke)" strokeWidth={3} isAnimationActive={false}
            dot={(props: any) => {
              const { cx, cy, payload, index } = props;
              if (!payload.has) return <circle key={index} cx={cx} cy={cy} r={3} fill={CHART.track} />;
              const c = payload.pct >= 60 ? CHART.success : payload.pct >= 40 ? '#f59e0b' : CHART.danger;
              return <circle key={index} cx={cx} cy={cy} r={4.5} fill={c} stroke="#fff" strokeWidth={2} />;
            }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
