'use client';

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart,
  ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CHART } from '@/components/ui';

const ACTUAL_BLUE = '#2e5ce6';
const ACTUAL_BLUE_CURRENT = '#1e4ed8';
const DEFICIT_GRAY = '#d8dee9';
const LANE = '#f1f4f9';

const kfmt = (v: number) => {
  const a = Math.abs(v);
  return a >= 1000 ? `${Math.round(a / 100) / 10}k` : `${a}`;
};

/* ---- Diverging bars on a full-width lane: actual (deep blue, right) vs deficit (gray, left) ---- */
export function DivergingBars({ data, currentMonth, height = 460 }: { data: any[]; currentMonth: string; height?: number }) {
  const rows = data.map((d) => ({ ...d, negDeficit: -d.deficit }));
  const max = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.deficit)));

  const YTick = (props: any) => {
    const cur = props.payload.value === currentMonth;
    return (
      <text x={props.x - 6} y={props.y} dy={4} textAnchor="end" fontSize={13} fontWeight={cur ? 800 : 600} fill={cur ? ACTUAL_BLUE : CHART.axis}>
        {props.payload.value}
      </text>
    );
  };
  // Actual value: white, inside the blue bar at its right end.
  const ActualLabel = (p: any) => {
    if (!p.value) return null;
    const inside = p.width > 30;
    const tx = inside ? p.x + p.width - 10 : p.x + p.width + 6;
    return <text x={tx} y={p.y + p.height / 2} dy={4} textAnchor={inside ? 'end' : 'start'} fontSize={12.5} fontWeight={700} fill={inside ? '#fff' : CHART.ink}>{p.value.toLocaleString()}</text>;
  };
  // Deficit value: dark text in a white rounded chip at the deficit (left) end.
  const DeficitChip = (p: any) => {
    if (!p.value) return null;
    const text = `-${p.value.toLocaleString()}`;
    const w = text.length * 6.6 + 16;
    const right = p.x - 4;
    const cy = p.y + p.height / 2;
    return (
      <g>
        <rect x={right - w} y={cy - 11} width={w} height={22} rx={7} fill="#fff" stroke="#e6eaf2" />
        <text x={right - w / 2} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#475569">{text}</text>
      </g>
    );
  };

  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart layout="vertical" data={rows} stackOffset="sign" margin={{ top: 8, right: 24, bottom: 8, left: 8 }} barCategoryGap="26%">
          <CartesianGrid horizontal={false} strokeDasharray="4 5" stroke="#e6eaf2" />
          <XAxis type="number" domain={[-max, max]} tickFormatter={kfmt} tick={{ fontSize: 12.5, fill: CHART.axis, fontWeight: 500 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="month" width={40} tick={<YTick />} axisLine={false} tickLine={false} />
          <ReferenceLine x={0} stroke="#dfe4ee" />
          {/* full-width pale lane per row (background of the actual bar spans the whole domain) */}
          <Bar dataKey="negDeficit" stackId="a" fill={DEFICIT_GRAY} radius={[11, 11, 11, 11]} isAnimationActive animationDuration={800} animationEasing="ease-out" maxBarSize={24}>
            <LabelList dataKey="deficit" content={DeficitChip} />
          </Bar>
          <Bar dataKey="actual" stackId="a" radius={[11, 11, 11, 11]} isAnimationActive animationDuration={900} animationEasing="ease-out" maxBarSize={24} background={{ fill: LANE, radius: 12 } as any}>
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
      <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: ACTUAL_BLUE }} /> Volume <span style={{ marginLeft: 24 }}>{vol}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, marginTop: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: '#111827' }} /> Revenue <span style={{ marginLeft: 24 }}>${kfmt(rev ?? 0)}</span>
      </div>
    </div>
  );
}

/* ---- Dual smooth area lines with hollow point markers ---- */
export function DualAreaLine({ data, height = 300 }: { data: any[]; height?: number }) {
  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 4 }}>
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
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12.5, fill: CHART.axis, fontWeight: 500 }} dy={6} />
          <YAxis yAxisId="v" hide />
          <YAxis yAxisId="r" orientation="right" hide />
          <Tooltip content={<DualTooltip />} cursor={{ stroke: CHART.track, strokeDasharray: '4 4' }} />
          <Area yAxisId="r" type="monotone" dataKey="revenue" stroke={CHART.ink} strokeWidth={2.5} fill="url(#revGrad)"
            dot={{ r: 3.5, fill: '#fff', stroke: CHART.ink, strokeWidth: 2 }} activeDot={{ r: 5, fill: '#fff', stroke: CHART.ink, strokeWidth: 2 }} isAnimationActive animationDuration={900} />
          <Area yAxisId="v" type="monotone" dataKey="volume" stroke={ACTUAL_BLUE} strokeWidth={3} fill="url(#volGrad)"
            dot={{ r: 4, fill: '#fff', stroke: ACTUAL_BLUE, strokeWidth: 2 }} activeDot={{ r: 5.5, fill: '#fff', stroke: ACTUAL_BLUE, strokeWidth: 2 }} isAnimationActive animationDuration={1000} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---- Weekly TAT compliance: blue→green line, region bands, floating Delayed/On-time pills ---- */
export function ComplianceLine({ week, height = 168 }: { week: any[]; height?: number }) {
  const data = week.map((w) => ({ day: w.day, pct: w.onTimePct ?? 0, has: w.total > 0 }));
  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 2, left: '18%', zIndex: 2, background: '#4f7df9', color: '#fff', fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 999 }}>Delayed</div>
      <div style={{ position: 'absolute', top: 2, left: '64%', zIndex: 2, background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 999 }}>On time</div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 30, right: 8, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="compStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4f7df9" />
              <stop offset="55%" stopColor="#4f7df9" />
              <stop offset="70%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <ReferenceArea x1="Mo" x2="We" fill="#eaf1ff" fillOpacity={0.7} />
          <ReferenceArea x1="Fr" x2="Su" fill="#dcfce7" fillOpacity={0.8} />
          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12.5, fill: CHART.axis, fontWeight: 500 }} dy={4} />
          <YAxis hide domain={[0, 100]} />
          <Line type="monotone" dataKey="pct" stroke="url(#compStroke)" strokeWidth={3.5} isAnimationActive animationDuration={950}
            dot={(props: any) => {
              const { cx, cy, payload, index } = props;
              if (!payload.has) return <circle key={index} cx={cx} cy={cy} r={3} fill={CHART.track} />;
              const c = payload.pct >= 60 ? CHART.success : payload.pct >= 40 ? '#4f7df9' : '#2e5ce6';
              return <circle key={index} cx={cx} cy={cy} r={5} fill="#fff" stroke={c} strokeWidth={2.5} />;
            }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
