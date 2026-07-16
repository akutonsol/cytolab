import { Skeleton } from '@/components/ui';

// Route loading cue for the Command Center — a structural skeleton that
// approximates the final layout (header · summary grid · rail + detail). Rises,
// does not fade; the Skeleton primitive respects reduced-motion.
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6" role="status" aria-live="polite">
      <span className="sr-only">Loading Enterprise Command Center…</span>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton height="h-7" width="w-72" />
          <Skeleton height="h-4" width="w-40" />
        </div>
        <Skeleton height="h-9" width="w-28" />
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} height="h-[76px]" />
        ))}
      </div>

      {/* Rail + detail */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} height="h-11" />
          ))}
        </div>
        <Skeleton height="h-96" />
      </div>
    </div>
  );
}
