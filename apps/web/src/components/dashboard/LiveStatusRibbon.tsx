'use client';

// Slim single-line status ribbon shown between the nav and the Action Center.
// Purely presentational — fed by the dashboard's already-loaded stats, no new
// API calls. Zero-orange: dots use emerald / indigo / red / gray only.

export interface LiveStatusStats {
  activeSpecimens: number;
  escalations: number;
}

export function LiveStatusRibbon({ stats }: { stats: LiveStatusStats }) {
  return (
    <div className="mb-2 flex items-center gap-4 px-0 py-2">
      <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
        Live Lab Status
      </span>
      <div className="h-3 w-px bg-gray-200" />

      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        <span className="text-[12px] font-medium text-gray-600">AI Processing</span>
      </div>
      <div className="h-1 w-1 rounded-full bg-gray-300" />

      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
        <span className="text-[12px] font-medium text-gray-600">{stats.activeSpecimens} Slides Active</span>
      </div>
      <div className="h-1 w-1 rounded-full bg-gray-300" />

      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        <span className="text-[12px] font-medium text-gray-600">{stats.escalations} Escalations</span>
      </div>
      <div className="h-1 w-1 rounded-full bg-gray-300" />

      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="text-[12px] font-medium text-gray-600">98.6% System Health</span>
      </div>
    </div>
  );
}
