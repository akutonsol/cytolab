'use client';

import { Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { SectionContainer, PageHeader, Skeleton } from '@/components/ui';
import { notify } from '@/lib/notify';
import { useAuditCapabilities } from '@/lib/audit/audit-capabilities';
import { useAuditEvent } from '@/lib/audit/use-audit-event';
import { auditEventQueryKey } from '@/lib/audit/audit-query-keys';
import { shouldPhiFailClosedRevert } from '@/lib/audit/audit-phi';
import { safeAuditBackHref } from '@/lib/audit/audit-back-nav';
import { AuditDetailBoundary } from '@/components/audit/AuditDetailBoundary';
import { AuditEventCard } from '@/components/audit/AuditEventCard';
import { PhiRevealControl } from '@/components/audit/PhiRevealControl';
import { PhiActiveNotice } from '@/components/audit/PhiActiveNotice';

/** Program 2 · P2-8C/D — Audit Event Detail. Read-only; consumes the frozen detail endpoint via
 *  AuditQueryClient. PHI is gated + confirmed + fail-closed. Back navigation preserves the prior
 *  list predicate URL (validated origin-relative to /audit); the cursor is never in the URL. */
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
  const router = useRouter();
  const caps = useAuditCapabilities();
  const queryClient = useQueryClient();

  const id = decodeURIComponent(String(params?.id ?? ''));
  const phi = sp.get('phi') === '1';
  const backRaw = sp.get('back');
  const backHref = safeAuditBackHref(backRaw);

  const q = useAuditEvent(id, phi, caps.canRead);

  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, [id]);

  const setPhi = (next: boolean) => {
    const p = new URLSearchParams();
    if (backRaw) p.set('back', backRaw);
    if (next) p.set('phi', '1');
    const qs = p.toString();
    router.replace(`/audit/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`);
  };

  // Fail-closed: a PHI detail failure (5xx/network — NOT 403/404) reverts to base, drops only the PHI
  // detail cache, and explains PHI is unavailable. Concealment (404) keeps its state; never partial PHI.
  const reverted = useRef(false);
  useEffect(() => {
    if (!q.isError || !shouldPhiFailClosedRevert(phi, q.error)) return;
    if (reverted.current) return;
    reverted.current = true;
    queryClient.removeQueries({ queryKey: auditEventQueryKey(id, true) }); // PHI cache only
    setPhi(false);
    notify.error('PHI is unavailable right now — showing the standard view.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isError, q.error, phi, id]);
  useEffect(() => { if (!phi) reverted.current = false; }, [phi]);

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
        actions={caps.canPhi ? <PhiRevealControl on={phi} onChange={setPhi} /> : undefined}
      />

      {phi && <PhiActiveNotice />}

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
