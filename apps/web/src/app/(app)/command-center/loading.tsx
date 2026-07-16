import { Skeleton } from '@/components/ui';

// Route loading cue for the Command Center shell (per-screen skeleton; rises,
// does not fade — information appears before decoration).
export default function Loading() {
  return (
    <div className="space-y-5 p-5">
      <Skeleton height="h-8" width="w-72" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} height="h-[68px]" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Skeleton height="h-96" />
        <Skeleton height="h-96" />
      </div>
    </div>
  );
}
