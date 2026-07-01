import type { ReactNode } from 'react';
import { cn } from './cn';
import { CHART } from './tokens';

interface GaugeProps {
  /** Target value shown large in the center. */
  goal: number;
  /** Current value — drives the arc fill (current/goal) and the on-arc chip. */
  current: number;
  label?: string;
  centerValue?: ReactNode;
  size?: number;
  /** Number of dots in the track ring. */
  dots?: number;
  className?: string;
}

/**
 * Completion dial: a gray dotted track ring with a partial blue progress arc
 * (current/goal of the circle) drawn over it, a big centered value + label, and
 * a small current-value chip sitting at the arc's end — matching the reference.
 */
export function Gauge({ goal, current, label = 'Goal', centerValue, size = 208, dots = 44, className }: GaugeProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;
  const start = -90; // 12 o'clock
  const fraction = goal > 0 ? Math.max(0, Math.min(1, current / goal)) : 0;

  // Round so SSR and client hydration emit identical coordinate strings.
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const polar = (radius: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [r3(cx + radius * Math.cos(a)), r3(cy + radius * Math.sin(a))] as const;
  };

  const track = Array.from({ length: dots }, (_, i) => polar(r, start + (i / dots) * 360));

  const endDeg = start + Math.min(fraction, 0.9999) * 360;
  const [ax0, ay0] = polar(r, start);
  const [ax1, ay1] = polar(r, endDeg);
  const largeArc = fraction * 360 > 180 ? 1 : 0;
  const arcPath = `M ${ax0} ${ay0} A ${r} ${r} 0 ${largeArc} 1 ${ax1} ${ay1}`;
  const [chipX, chipY] = polar(r, endDeg);

  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {track.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2} fill={CHART.track} />
        ))}
        {fraction > 0 && (
          <path d={arcPath} fill="none" stroke={CHART.primary} strokeWidth={5} strokeLinecap="round" />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[34px] font-extrabold leading-none tracking-tight text-text">{centerValue ?? goal}</span>
        <span className="mt-1.5 text-label font-medium text-text-secondary">{label}</span>
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
