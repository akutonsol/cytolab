'use client';

import { confidenceColor, levelFor, type AIConfidenceLevel } from '@/lib/ai-screening';

interface Props {
  value: number | null; // 0-100
  level?: AIConfidenceLevel | null;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
}

/** Circular progress ring colored by confidence level (green/amber/red). */
export function ConfidenceRing({ value, level, size = 44, stroke = 4, showLabel = true }: Props) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = confidenceColor(level ?? levelFor(value), value);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-bold tabular-nums" style={{ color, fontSize: size * 0.28 }}>
            {value == null ? '—' : Math.round(v)}
          </span>
        </div>
      )}
    </div>
  );
}
