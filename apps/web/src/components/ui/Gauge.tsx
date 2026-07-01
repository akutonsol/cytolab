import type { ReactNode } from 'react';
import { cn } from './cn';
import { CHART } from './tokens';

interface GaugeProps {
  /** Target value shown large in the center. */
  goal: number;
  /** Current value — drives the fill fraction (current/goal) and the on-arc chip. */
  current: number;
  label?: string;
  centerValue?: ReactNode;
  size?: number;
  segments?: number;
  className?: string;
}

/**
 * Segmented completion dial: a ring of ticks (blue for progressed, light for the
 * remainder), a big centered value + label, and a small current-value chip
 * sitting on the arc — matching the "Orders Completion Rate" dial.
 */
export function Gauge({ goal, current, label = 'Goal', centerValue, size = 208, segments = 52, className }: GaugeProps) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 6;
  const rInner = rOuter - 13;
  const start = -90; // 12 o'clock
  const sweep = 360;
  const fraction = goal > 0 ? Math.max(0, Math.min(1, current / goal)) : 0;
  const filled = Math.round(fraction * segments);

  // Round to a fixed precision so SSR and client hydration produce identical
  // coordinate strings (raw floats differ in their last digit → hydration warning).
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const polar = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [r3(cx + r * Math.cos(a)), r3(cy + r * Math.sin(a))] as const;
  };

  const ticks = Array.from({ length: segments }, (_, i) => {
    const deg = start + (i / segments) * sweep;
    const [x1, y1] = polar(rInner, deg);
    const [x2, y2] = polar(rOuter, deg);
    return { x1, y1, x2, y2, on: i < filled };
  });

  const [chipX, chipY] = polar(rOuter + 1, start + fraction * sweep);

  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.on ? CHART.primary : CHART.track}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[34px] font-bold leading-none text-text">{centerValue ?? goal}</span>
        <span className="mt-1 text-label font-medium text-text-secondary">{label}</span>
      </div>
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-pill bg-text px-2 py-0.5 text-[11px] font-semibold text-white shadow-float"
        style={{ left: chipX, top: chipY }}
      >
        {current}
      </div>
    </div>
  );
}
