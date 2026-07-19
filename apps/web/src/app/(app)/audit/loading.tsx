import { SectionContainer, Skeleton } from '@/components/ui';

/** Program 2 · P2-8B — route-loading skeleton for the Audit Log (loading cue ≤ 200ms). */
export default function AuditLoading() {
  return (
    <SectionContainer>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      </div>
    </SectionContainer>
  );
}
