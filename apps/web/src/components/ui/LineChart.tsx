'use client';

import {
  CartesianGrid,
  Line,
  LineChart as RLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART } from './tokens';
import { cn } from './cn';

export interface LineSeries {
  key: string;
  label?: string;
  color?: string;
}

interface LineChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: LineSeries[];
  height?: number;
  className?: string;
}

function ChipTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-control bg-text px-3 py-2 text-white shadow-float">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-white/60">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs font-semibold">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

/** Smooth multi-series line chart: blue primary + near-black secondary, soft grid. */
export function LineChart({ data, xKey, series, height = 220, className }: LineChartProps) {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="0" />
          <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: CHART.axis }} dy={6} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: CHART.axis }} width={28} />
          <Tooltip content={<ChipTooltip />} cursor={{ stroke: CHART.track, strokeDasharray: '4 4' }} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label ?? s.key}
              stroke={s.color ?? (i === 0 ? CHART.primary : CHART.ink)}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}
