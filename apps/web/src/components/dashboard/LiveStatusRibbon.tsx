'use client';

// Slim single-line status ribbon shown between the nav and the Action Center.
// Purely presentational — fed by the dashboard's already-loaded stats, no new
// API calls. Zero-orange: dots use emerald / indigo / red / gray only.

export interface LiveStatusStats {
  activeSpecimens: number;
  escalations: number;
  aiQueue: number;
  fhirConnected?: boolean;
}

type Tone = 'emerald' | 'red' | 'indigo';
const DOT: Record<Tone, string> = { emerald: 'bg-emerald-500', red: 'bg-red-500', indigo: 'bg-indigo-500' };
const LABEL: Record<Tone, string> = { emerald: 'text-emerald-600', red: 'text-red-600', indigo: 'text-indigo-600' };

export function LiveStatusRibbon({ stats }: { stats: LiveStatusStats }) {
  const fhirOk = stats.fhirConnected !== false;
  const items: { tone: Tone; label: string; value: string }[] = [
    { tone: 'emerald', label: 'AI Online', value: `${stats.activeSpecimens} Active Slides` },
    { tone: 'red', label: 'Escalations', value: `${stats.escalations} Waiting` },
    { tone: 'indigo', label: 'AI Queue', value: `${stats.aiQueue} Remaining` },
    { tone: 'emerald', label: 'System Health', value: '98.6%' },
    { tone: 'emerald', label: 'Pathologists', value: '4 Online' },
    { tone: 'emerald', label: 'Laboratory', value: 'Normal' },
    { tone: 'emerald', label: 'API', value: 'Healthy' },
    { tone: fhirOk ? 'emerald' : 'red', label: 'FHIR', value: fhirOk ? 'Connected' : 'Offline' },
  ];

  return (
    <div className="mb-2 flex items-center gap-4 px-0 py-2.5">
      {/* Label */}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" style={{ animationDuration: '2s' }} />
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Live Lab Status</span>
      </div>

      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-4">
          <div className="h-6 w-px bg-gray-100" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <div className={`h-1.5 w-1.5 animate-pulse rounded-full ${DOT[it.tone]}`} style={{ animationDuration: '2s' }} />
              <span className={`text-[11px] font-bold uppercase tracking-wide ${LABEL[it.tone]}`}>{it.label}</span>
            </div>
            <span className="whitespace-nowrap text-[12px] font-medium text-gray-600">{it.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
