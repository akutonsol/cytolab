'use client';

import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { CHART } from './tokens';
import { cn } from './cn';

interface MiniAreaChartProps {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
}

/** Compact axis-less area sparkline for stat cards (the $12k / 78% / $360 tiles). */
export function MiniAreaChart({ data, color = CHART.primary, height = 44, className }: MiniAreaChartProps) {
  const points = data.map((v, i) => ({ i, v }));
  const gid = `mini-${color.replace('#', '')}`;
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gid})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
