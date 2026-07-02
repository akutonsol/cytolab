'use client';

import {
  Bar, BarChart, CartesianGrid, Cell, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  RadialBar, RadialBarChart, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis,
} from 'recharts';

const ORANGE = '#f1592b';
const ORANGE_DEEP = '#dc4718';
const CHARCOAL = '#2b2d31';
const LAV = '#c3b8f5';
const GREEN = '#34c759';
const INK = '#0f172a';
const AXIS = '#6b7280';
const GRID = '#e8edf4';
const BAR = '#34363d';

/* ---- Dense daily throughput "comb": thick charcoal bars; peak = blue lollipop (ref) ---- */
export function ThroughputComb({ data, height = 280 }: { data: any[]; height?: number }) {
  const peakIdx = data.findIndex((d) => d.peak);
  const peak = data[peakIdx];
  const ticks = data.filter((d) => d.label).map((d) => d.i);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 8, bottom: 4, left: 4 }} barCategoryGap="16%">
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="5 6" />
        <XAxis dataKey="i" type="number" domain={[0, data.length - 1]} axisLine={false} tickLine={false}
          ticks={ticks} tickFormatter={(i) => data[i]?.label ?? ''} tick={{ fontSize: 13, fill: AXIS, fontWeight: 500 }} dy={8} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: AXIS, fontWeight: 500 }} width={36}
          tickFormatter={(v) => (v >= 1000 ? `${v / 1000}K` : `${v}`)} />
        {peak && <ReferenceLine segment={[{ x: peakIdx, y: 0 }, { x: peakIdx, y: peak.value }]} stroke={ORANGE} strokeWidth={3} ifOverflow="visible" />}
        {peak && <ReferenceDot x={peakIdx} y={peak.value} r={6} fill={ORANGE} stroke="#fff" strokeWidth={2.5} />}
        <Bar dataKey="value" isAnimationActive animationDuration={900} animationEasing="ease-out" maxBarSize={7} radius={[3.5, 3.5, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.peak ? 'transparent' : BAR} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---- Performance radar: this period (blue) vs last period (ink), pentagon ---- */
export function RadarMetrics({ data, height = 280 }: { data: any[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="68%" margin={{ top: 14, right: 48, bottom: 14, left: 48 }}>
        <PolarGrid stroke={GRID} />
        <PolarAngleAxis dataKey="dim" tick={{ fontSize: 13, fill: AXIS, fontWeight: 600 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: '#b8bec9' }} tickCount={3} axisLine={false} />
        <Radar name="Last period" dataKey="previous" stroke={CHARCOAL} fill={CHARCOAL} fillOpacity={0.05} strokeWidth={2}
          isAnimationActive animationDuration={900} dot={{ r: 4, fill: '#fff', stroke: CHARCOAL, strokeWidth: 2 }} />
        <Radar name="This period" dataKey="current" stroke={ORANGE} fill={ORANGE} fillOpacity={0.16} strokeWidth={2.5}
          isAnimationActive animationDuration={1000} dot={{ r: 4.5, fill: '#fff', stroke: ORANGE, strokeWidth: 2 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* ---- OEE donut: thick blue-gradient outer ring + thinner purple inner ring ---- */
export function OeeDonut({ value, inner, size = 216 }: { value: number; inner: number; size?: number }) {
  const ring = (val: number, fill: string, ir: string, or: string, bar: number, key: string, delay = 0) => (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius={ir} outerRadius={or} data={[{ value: val }]} startAngle={90} endAngle={-270} barSize={bar}>
          {key === 'outer' && (
            <defs>
              <linearGradient id="oeeGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={ORANGE} />
                <stop offset="100%" stopColor={ORANGE_DEEP} />
              </linearGradient>
            </defs>
          )}
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={bar / 2} fill={fill} background={{ fill: '#edf1f8' } as any}
            isAnimationActive animationDuration={1100} animationBegin={delay} animationEasing="ease-out" />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {ring(value, 'url(#oeeGrad)', '72%', '100%', 18, 'outer')}
      {ring(inner, LAV, '48%', '70%', 14, 'inner', 250)}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 36, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>{value}%</span>
        <span style={{ fontSize: 13, color: AXIS, fontWeight: 700, letterSpacing: '0.06em' }}>OEE</span>
      </div>
    </div>
  );
}

/* ---- Small circular progress ring for a priority record ---- */
export function ProgressRing({ pct, size = 40 }: { pct: number; size?: number }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const color = pct >= 50 ? GREEN : ORANGE;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8edf4" strokeWidth={4.5} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4.5} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1s ease-out' }}
      />
    </svg>
  );
}
