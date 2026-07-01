'use client';

import {
  Bar, BarChart, Cell, PolarAngleAxis, PolarGrid, Radar, RadarChart, RadialBar, RadialBarChart,
  ReferenceLine, ResponsiveContainer, XAxis, YAxis,
} from 'recharts';

const BLUE = '#4f7df9';
const BLUE_DEEP = '#2e5ce6';
const INK = '#111827';
const AXIS = '#9ca3af';
const GRID = '#edf2f7';

/* ---- Dense daily throughput bars; peak day highlighted blue with a marker line ---- */
export function ThroughputBars({ data, height = 260 }: { data: any[]; height?: number }) {
  const peakIdx = data.findIndex((d) => d.peak);
  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }} barCategoryGap="8%">
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: AXIS }} interval={0} dy={6} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: AXIS }} width={34} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}K` : `${v}`)} />
          {peakIdx >= 0 && <ReferenceLine x={data[peakIdx].label || peakIdx} stroke={BLUE} strokeWidth={1.5} ifOverflow="extendDomain" />}
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={6}>
            {data.map((d, i) => <Cell key={i} fill={d.peak ? BLUE_DEEP : '#cbd5e1'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---- Performance radar: this period (blue) vs last period (ink) ---- */
export function RadarMetrics({ data, height = 300 }: { data: any[]; height?: number }) {
  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} outerRadius="62%" margin={{ top: 10, right: 44, bottom: 10, left: 44 }}>
          <PolarGrid stroke={GRID} />
          <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: AXIS }} />
          <Radar name="Last period" dataKey="previous" stroke={INK} fill={INK} fillOpacity={0.04} strokeWidth={1.5} isAnimationActive={false} dot={{ r: 2.5, fill: INK }} />
          <Radar name="This period" dataKey="current" stroke={BLUE} fill={BLUE} fillOpacity={0.16} strokeWidth={2} isAnimationActive={false} dot={{ r: 3, fill: BLUE }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---- OEE-style donut with a centered score ---- */
export function OeeDonut({ value, size = 190 }: { value: number; size?: number }) {
  const data = [{ name: 'oee', value }];
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="70%" outerRadius="100%" data={data} startAngle={90} endAngle={-270} barSize={16}>
          <defs>
            <linearGradient id="oeeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={BLUE} />
              <stop offset="100%" stopColor={BLUE_DEEP} />
            </linearGradient>
          </defs>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={12} fill="url(#oeeGrad)" background={{ fill: '#eef2f7' } as any} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>{value}%</span>
        <span style={{ fontSize: 11, color: AXIS, fontWeight: 600, letterSpacing: '0.06em' }}>OEE</span>
      </div>
    </div>
  );
}

/* ---- Small circular progress ring for a priority record ---- */
export function ProgressRing({ pct, size = 44 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const done = pct >= 100;
  const color = done ? '#22c55e' : BLUE;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={4} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
