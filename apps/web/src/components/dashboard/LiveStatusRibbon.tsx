'use client';

// Slim single-line status ribbon shown between the nav and the Action Center.
// Purely presentational — fed by the dashboard's already-loaded stats, no new
// API calls. Zero-orange: dots use emerald / indigo / red / gray only.

export interface LiveStatusStats {
  activeSpecimens: number;
  escalations: number;
  aiQueue: number;
}

export function LiveStatusRibbon({ stats }: { stats: LiveStatusStats }) {
  return (
    <div className="mb-2 flex items-center gap-5 px-0 py-2.5">
      {/* Label */}
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Live Lab Status</span>
      </div>
      <div className="h-4 w-px bg-gray-200" />

      {/* AI Online */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">AI Online</span>
        </div>
        <span className="text-[12px] font-medium text-gray-600">{stats.activeSpecimens} Active Slides</span>
      </div>
      <div className="h-6 w-px bg-gray-100" />

      {/* Escalations */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-red-600">Escalations</span>
        </div>
        <span className="text-[12px] font-medium text-gray-600">{stats.escalations} Waiting</span>
      </div>
      <div className="h-6 w-px bg-gray-100" />

      {/* AI Queue */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">AI Queue</span>
        </div>
        <span className="text-[12px] font-medium text-gray-600">{stats.aiQueue} Remaining</span>
      </div>
      <div className="h-6 w-px bg-gray-100" />

      {/* System Health */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">System Health</span>
        </div>
        <span className="text-[12px] font-medium text-gray-600">98.6%</span>
      </div>
    </div>
  );
}
