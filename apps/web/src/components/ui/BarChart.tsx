'use client';

import { Bar, BarChart as RBarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { CHART } from './tokens';
import { cn } from './cn';

export interface BarDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarDatum[];
  /** Index of the highlighted (blue) bar. Defaults to the max value. */
  peakIndex?: number;
  peakLabel?: string;
  /** Big number rendered to the left of the chart. */
  total?: string | number;
  totalLabel?: string;
  height?: number;
  className?: string;
}

/** Renders the value on top of every bar; a "Load peak" chip under the peak bar. */
function TopValue(props: any) {
  const { x, y, width, value } = props;
  return (
    <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={12} fontWeight={600} fill={CHART.ink}>
      {value}
    </text>
  );
}

export function BarChart({ data, peakIndex, peakLabel = 'Load peak', total, totalLabel, height = 200, className }: BarChartProps) {
  const peak = peakIndex ?? data.reduce((mi, d, i, a) => (d.value > a[mi].value ? i : mi), 0);

  const PeakChip = (props: any) => {
    const { x, y, width, height: h, index } = props;
    if (index !== peak) return null;
    const text = peakLabel;
    const w = text.length * 6.2 + 24;
    const cxp = x + width / 2;
    const cyp = y + h + 16;
    return (
      <g>
        <rect x={cxp - w / 2} y={cyp - 11} width={w} height={22} rx={11} fill={CHART.ink} />
        <text x={cxp} y={cyp + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
          {`✦ ${text}`}
        </text>
      </g>
    );
  };

  return (
    <div className={cn('flex items-center gap-6', className)}>
      {total !== undefined && (
        <div className="flex shrink-0 flex-col">
          <span className="text-[30px] font-bold leading-none text-text">{total}</span>
          {totalLabel && <span className="mt-1 text-meta text-text-tertiary">{totalLabel}</span>}
        </div>
      )}
      <div className="min-w-0 flex-1" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RBarChart data={data} margin={{ top: 22, right: 8, bottom: 28, left: 8 }}>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: CHART.axis }}
              dy={6}
            />
            <YAxis hide />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={38} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={i} fill={i === peak ? CHART.primary : CHART.barIdle} />
              ))}
              <LabelList dataKey="value" content={TopValue} />
              <LabelList content={PeakChip} />
            </Bar>
          </RBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
