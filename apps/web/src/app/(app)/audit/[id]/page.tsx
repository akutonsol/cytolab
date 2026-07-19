'use client';

import { Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { SectionContainer, PageHeader, Skeleton } from '@/components/ui';
import { useAuditCapabilities } from '@/lib/audit/audit-capabilities';
import { useAuditEvent } from '@/lib/audit/use-audit-event';
import { AuditDetailBoundary } from '@/components/audit/AuditDetailBoundary';
import { AuditEventCard } from '@/components/audit/AuditEventCard';

/** Program 2 · P2-8C — Audit Event Detail. Read-only; consumes the frozen detail endpoint via
 *  AuditQueryClient. `phi` is only carried through as a transport predicate (the reveal workflow is
 *  P2-8D). Back navigation preserves the prior list predicate URL; the cursor is never in the URL. */
export default function AuditDetailPage() {
  return (
    <Suspense fallback={<DetailFallback />}>
      <AuditDetailContent />
    </Suspense>
  );
}

function AuditDetailContent() {
  const params = useParams();
  const sp = useSearchParams();
  const caps = useAuditCapabilities();

  const id = decodeURIComponent(String(params?.id ?? ''));
  const phi = sp.get('phi') === '1';
  // Only honor a same-app audit list URL for back navigation (no open redirect); else fall back.
  const backRaw = sp.get('back');
  const backHref = backRaw && backRaw.startsWith('/audit') ? backRaw : '/audit';

  const q = useAuditEvent(id, phi, caps.canRead);

  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, [id]);

  return (
    <SectionContainer>
      <PageHeader
        eyebrow="Compliance · Audit Log"
        title="Audit event"
        titleRef={titleRef}
        focusableTitle
        description={id || 'No event selected'}
        back={
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors duration-fast ease-standard hover:text-slate-900"
          >
            <ArrowLeft size={15} /> Back to Audit Log
          </Link>
        }
      />

      <AuditDetailBoundary
        unauthorized={!caps.canRead}
        isLoading={caps.canRead && q.isLoading}
        isError={q.isError}
        error={q.error}
        hasData={!!q.data}
        onRetry={() => q.refetch()}
      >
        {q.data && <AuditEventCard event={q.data} />}
      </AuditDetailBoundary>
    </SectionContainer>
  );
}

function DetailFallback() {
  return (
    <SectionContainer>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    </SectionContainer>
  );
}
