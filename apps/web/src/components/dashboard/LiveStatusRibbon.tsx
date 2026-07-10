'use client';

// Lab State surface — the single dominant read at the top of the Operations
// Workspace (docs/PATHOS_OPERATIONS_EXPERIENCE.md §2, Register 1). Evolved from the
// former single-line status ribbon: it now LEADS with one synthesized state (Calm /
// Watch / Strained / Critical) that sets the emotional register, and keeps the live
// readings beneath it as the vital signs.
//
// Purely presentational — synthesized from the dashboard's already-loaded stats, no
// new API calls. The aliveness is truth (real numbers, real time), not decoration.
//
// Zero-orange: every warm state uses the detector-safe dark ambers (#A16207 / #854D0E),
// never orange/amber Tailwind utilities. Calm is quiet emerald; Critical is red.

export interface LiveStatusStats {
  activeSpecimens: number;
  escalations: number;
  aiQueue: number;
  fhirConnected?: boolean;
  /** Throughput change vs prior period; gives Flow a direction (Foresight). */
  throughputDelta?: number;
}

type State = 'Calm' | 'Watch' | 'Strained' | 'Critical';

// Quiet when well, grave when not. Colours are the mood; used sparingly.
const TONE: Record<State, { fg: string; rail: string; tint?: string }> = {
  Calm: { fg: '#047857', rail: '#10B981' }, // emerald — quiet confidence, no tint
  Watch: { fg: '#A16207', rail: '#A16207', tint: '#FEFCE8' }, // safe amber on pale yellow
  Strained: { fg: '#854D0E', rail: '#854D0E', tint: '#FEF3C7' }, // strong amber
  Critical: { fg: '#B91C1C', rail: '#DC2626', tint: '#FEF2F2' }, // red, reserved
};

// Lab State is derived, never entered by hand: a true function of the vitals.
// Thresholds are deliberately conservative — the lab is allowed to read Calm.
function deriveState(s: LiveStatusStats): { state: State; reason: string } {
  const esc = s.escalations;
  const q = s.aiQueue;
  if (s.fhirConnected === false) return { state: 'Critical', reason: 'FHIR interface offline — results are not returning' };
  if (esc >= 6) return { state: 'Critical', reason: `${esc} escalations waiting` };
  if (esc >= 3) return { state: 'Strained', reason: `${esc} escalations building` };
  if (q >= 20) return { state: 'Strained', reason: `${q} cases in the AI queue` };
  if (esc >= 1) return { state: 'Watch', reason: `${esc} escalation${esc > 1 ? 's' : ''} to clear` };
  if (q >= 8) return { state: 'Watch', reason: `AI queue building — ${q} remaining` };
  return { state: 'Calm', reason: 'All vitals nominal' };
}

export function LiveStatusRibbon({ stats }: { stats: LiveStatusStats }) {
  const { state, reason } = deriveState(stats);
  const tone = TONE[state];
  const fhirOk = stats.fhirConnected !== false;

  // Flow direction (Foresight): the reading carries where it is heading.
  const delta = stats.throughputDelta;
  const flowDir = typeof delta === 'number' ? (delta > 1 ? 'rising' : delta < -1 ? 'easing' : 'steady') : undefined;

  // The vital signs beneath the state, grouped by the five vitals of laboratory
  // health. Only real, loaded signals — nothing fabricated.
  const vitals: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Flow', value: flowDir ? `${stats.activeSpecimens} active · ${flowDir}` : `${stats.activeSpecimens} active` },
    { label: 'Attention', value: `${stats.escalations} waiting`, strong: stats.escalations > 0 },
    { label: 'Pressure', value: `${stats.aiQueue} in queue` },
    { label: 'Integrity', value: fhirOk ? 'Interfaces healthy' : 'FHIR offline', strong: !fhirOk },
  ];

  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl px-4 py-3"
      style={{
        borderLeft: `4px solid ${tone.rail}`,
        background: tone.tint ?? 'transparent',
        border: '1px solid #EEF2F7',
        borderLeftWidth: 4,
        borderLeftColor: tone.rail,
      }}
    >
      {/* Register 1 — the dominant state read */}
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <span
          className="h-2 w-2 animate-pulse rounded-full"
          style={{ background: tone.rail, animationDuration: '2s' }}
          aria-hidden
        />
        <div className="flex flex-col leading-tight">
          <span className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">Laboratory State</span>
          <div className="flex items-baseline gap-2">
            <span className="text-[17px] font-extrabold tracking-tight" style={{ color: tone.fg }}>{state}</span>
            <span className="text-[12px] font-medium text-gray-500">{reason}</span>
          </div>
        </div>
      </div>

      <div className="hidden h-8 w-px bg-gray-200 sm:block" />

      {/* Register 2 — the vital signs beneath the state */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
        {vitals.map((v) => (
          <div key={v.label} className="flex flex-col leading-tight">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{v.label}</span>
            <span
              className="whitespace-nowrap text-[12.5px] font-semibold"
              style={{ color: v.strong ? tone.fg : '#475569' }}
            >
              {v.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
