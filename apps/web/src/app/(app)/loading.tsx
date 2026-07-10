import { Skeleton, SkeletonStat } from '@/components/ui';

/**
 * Route-segment loading UI for every authenticated screen.
 *
 * Next renders this while a route's code is still being fetched — before any component
 * mounts, so before any page-level skeleton can exist. Without it the user sees the shell
 * with an empty content area.
 *
 * It deliberately mirrors the shape shared by almost every app screen: a title, a row of
 * KPI cards, then a wide panel. It never invents rows (Experience Principle §1).
 */
export default function Loading() {
  return (
    <div className="min-h-full pb-10 pt-4" aria-busy aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-3">
        <Skeleton shape="block" width="w-72" height="h-9" />
        <Skeleton shape="text" width="w-96" />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-lightgray bg-surface p-5">
            <SkeletonStat />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-lightgray bg-surface p-6">
        <Skeleton shape="block" width="w-48" height="h-6" />
        <div className="mt-5 flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} shape="text" width={i % 3 === 2 ? 'w-2/3' : 'w-full'} />
          ))}
        </div>
      </div>
    </div>
  );
}
