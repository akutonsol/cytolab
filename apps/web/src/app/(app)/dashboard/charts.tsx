'use client';

import {
  Bar, BarChart, CartesianGrid, Cell, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const BLUE = '#4F46E5';
const BLUE_DEEP = '#3730A3';
const BLUE_GHOST = '#C7D2FE'; // for ghost/capacity bars
const BLUE_SOFT = '#EEF2FF'; // for backgrounds
const CHARCOAL = '#2b2d31';
const GREEN = '#34c759';
const AXIS = '#6b7280';
const GRID = '#e8edf4';

/* ---- Dense daily throughput "comb": thick charcoal bars; peak = blue lollipop (ref) ---- */
export function ThroughputComb({ data, height = 280 }: { data: any[]; height?: number }) {
  const peakIdx = data.findIndex((d) => d.peak);
  const peak = data[peakIdx];
  const ticks = data.filter((d) => d.label).map((d) => d.i);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 8, bottom: 4, left: 4 }} barCategoryGap="16%" barGap={-7}>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="5 6" />
        <XAxis dataKey="i" type="number" domain={[0, data.length - 1]} axisLine={false} tickLine={false}
          ticks={ticks} tickFormatter={(i) => data[i]?.label ?? ''} tick={{ fontSize: 13, fill: AXIS, fontWeight: 500 }} dy={8} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: AXIS, fontWeight: 500 }} width={36}
          tickFormatter={(v) => (v >= 1000 ? `${v / 1000}K` : `${v}`)} />
        <Tooltip
          cursor={{ fill: 'rgba(79,70,229,0.04)' }}
          content={({ active, payload, label }: any) => {
            if (!active || !payload?.length) return null;
            return (
              <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 2 }}>{data[label]?.label || ''}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#4F46E5' }}>{payload[1]?.value ?? payload[0]?.value} specimens</div>
              </div>
            );
          }}
        />
        {peak && <ReferenceLine segment={[{ x: peakIdx, y: 0 }, { x: peakIdx, y: peak.value }]} stroke={BLUE} strokeWidth={3} ifOverflow="visible" />}
        {peak && <ReferenceDot x={peakIdx} y={peak.value} r={6} fill={BLUE} stroke="#fff" strokeWidth={2.5} />}
        {/* Ghost capacity bar — full height behind the real bar */}
        <Bar dataKey="capacity" maxBarSize={7} radius={[3.5, 3.5, 0, 0]} fill={BLUE_GHOST} opacity={0.4} isAnimationActive={false} />
        {/* Actual bar on top */}
        <Bar dataKey="value" maxBarSize={7} radius={[3.5, 3.5, 0, 0]} isAnimationActive animationDuration={900} animationEasing="ease-out">
          {data.map((d, i) => <Cell key={i} fill={d.peak ? 'transparent' : BLUE} opacity={d.peak ? 0 : 0.85} />)}
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
        <Radar name="Last period" dataKey="previous" stroke={CHARCOAL} fill="none" fillOpacity={0} strokeWidth={2}
          isAnimationActive animationDuration={900} dot={{ r: 3.5, fill: CHARCOAL, stroke: CHARCOAL, strokeWidth: 1 }} />
        <Radar name="This period" dataKey="current" stroke={BLUE} fill={BLUE} fillOpacity={0.16} strokeWidth={2.5}
          isAnimationActive animationDuration={1000} dot={{ r: 4.5, fill: '#fff', stroke: BLUE, strokeWidth: 2 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* ---- OEE donut: segmented dual ring (36 individual dashes) ---- */
export function OeeDonut({ value, inner, size = 216 }: { value: number; inner: number; size?: number }) {
  const segments = 36;
  const gap = 4; // degrees gap between segments
  const segAngle = (360 / segments) - gap;
  const r1 = size * 0.46; // outer ring radius
  const r2 = size * 0.32; // inner ring radius
  const cx = size / 2;
  const cy = size / 2;

  const filledOuter = Math.round((value / 100) * segments);
  const filledInner = Math.round((inner / 100) * segments);

  const arcPath = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
    const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
    const x1 = cx + r * Math.cos(toRad(startAngle));
    const y1 = cy + r * Math.sin(toRad(startAngle));
    const x2 = cx + r * Math.cos(toRad(endAngle));
    const y2 = cy + r * Math.sin(toRad(endAngle));
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {Array.from({ length: segments }).map((_, i) => {
          const startAngle = i * (360 / segments);
          const endAngle = startAngle + segAngle;
          const outerFilled = i < filledOuter;
          const innerFilled = i < filledInner;
          return (
            <g key={i}>
              <path d={arcPath(cx, cy, r1, startAngle, endAngle)} stroke={outerFilled ? BLUE : '#E2E8F0'} strokeWidth={10} fill="none" strokeLinecap="round" />
              <path d={arcPath(cx, cy, r2, startAngle, endAngle)} stroke={innerFilled ? '#A5B4FC' : BLUE_SOFT} strokeWidth={7} fill="none" strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 36, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', fontFamily: 'Geist,sans-serif' }}>{value}%</span>
        <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>OEE</span>
      </div>
    </div>
  );
}

/* ---- Small circular progress ring for a priority record ---- */
export function ProgressRing({ pct, size = 40 }: { pct: number; size?: number }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const color = pct >= 50 ? GREEN : BLUE;
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
