import { SectionContainer, Skeleton } from '@/components/ui';

/** Program 2 · P2-8C — route-loading skeleton for the Audit Event Detail. */
export default function AuditDetailLoading() {
  return (
    <SectionContainer>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-6 w-56" />
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </div>
    </SectionContainer>
  );
}
