'use client';

import {
  Bar, BarChart, CartesianGrid, Cell, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  RadialBar, RadialBarChart, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis,
} from 'recharts';

const BLUE = '#4f7df9';
const BLUE_DEEP = '#2e5ce6';
const PURPLE = '#b9a8e8';
const INK = '#111827';
const AXIS = '#9ca3af';
const GRID = '#eef2f7';
const BAR = '#c3c9d4';

/* ---- Dense daily throughput "comb"; peak day = blue line + dot (ref: orange) ---- */
export function ThroughputComb({ data, height = 250 }: { data: any[]; height?: number }) {
  const peakIdx = data.findIndex((d) => d.peak);
  const peak = data[peakIdx];
  const ticks = data.filter((d) => d.label).map((d) => d.i);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 8, bottom: 4, left: 4 }} barCategoryGap="14%">
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="4 5" />
        <XAxis dataKey="i" type="number" domain={[0, data.length - 1]} axisLine={false} tickLine={false}
          ticks={ticks} tickFormatter={(i) => data[i]?.label ?? ''} tick={{ fontSize: 11, fill: AXIS }} dy={6} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: AXIS }} width={34}
          tickFormatter={(v) => (v >= 1000 ? `${v / 1000}K` : `${v}`)} />
        {peak && <ReferenceLine x={peakIdx} stroke={BLUE_DEEP} strokeWidth={2} />}
        {peak && <ReferenceDot x={peakIdx} y={peak.value} r={4} fill={BLUE_DEEP} stroke="#fff" strokeWidth={2} />}
        <Bar dataKey="value" isAnimationActive={false} maxBarSize={3} radius={[2, 2, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.peak ? BLUE_DEEP : BAR} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---- Performance radar: this period (blue) vs last period (ink), pentagon ---- */
export function RadarMetrics({ data, height = 250 }: { data: any[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="66%" margin={{ top: 12, right: 40, bottom: 12, left: 40 }}>
        <PolarGrid stroke={GRID} />
        <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: AXIS }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: '#c7ccd6' }} tickCount={3} axisLine={false} />
        <Radar name="Last period" dataKey="previous" stroke={INK} fill={INK} fillOpacity={0.05} strokeWidth={1.5} isAnimationActive={false} dot={{ r: 2.5, fill: INK }} />
        <Radar name="This period" dataKey="current" stroke={BLUE} fill={BLUE} fillOpacity={0.16} strokeWidth={2} isAnimationActive={false} dot={{ r: 3, fill: BLUE }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* ---- OEE donut: blue-gradient outer ring + purple inner ring, centered score ---- */
export function OeeDonut({ value, inner, size = 200 }: { value: number; inner: number; size?: number }) {
  const data = [{ value, fill: 'url(#oeeGrad)' }, { value: inner, fill: PURPLE }];
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="52%" outerRadius="100%" data={data} startAngle={90} endAngle={-270} barSize={13}>
          <defs>
            <linearGradient id="oeeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={BLUE} />
              <stop offset="100%" stopColor={BLUE_DEEP} />
            </linearGradient>
          </defs>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={10} background={{ fill: '#eef2f7' } as any} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>{value}%</span>
        <span style={{ fontSize: 11, color: AXIS, fontWeight: 600, letterSpacing: '0.04em' }}>OEE</span>
      </div>
    </div>
  );
}

/* ---- Small circular progress ring for a priority record ---- */
export function ProgressRing({ pct, size = 34 }: { pct: number; size?: number }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const done = pct >= 100;
  const color = done ? '#22c55e' : BLUE;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={3.5} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
