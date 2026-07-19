'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { SectionContainer, PageHeader, Skeleton } from '@/components/ui';
import { notify } from '@/lib/notify';
import { parseAuditFilters, serializeAuditFilters, auditPredicateKey, AuditFilterState } from '@/lib/audit/audit-filters';
import { useAuditCapabilities } from '@/lib/audit/audit-capabilities';
import { useAuditEvents } from '@/lib/audit/use-audit-events';
import { useAuditCursorStore } from '@/lib/audit/audit-cursor-store';
import { shouldPhiFailClosedRevert } from '@/lib/audit/audit-phi';
import { AuditFilters } from '@/components/audit/AuditFilters';
import { AuditScopeSelector } from '@/components/audit/AuditScopeSelector';
import { PhiRevealControl } from '@/components/audit/PhiRevealControl';
import { PhiActiveNotice } from '@/components/audit/PhiActiveNotice';
import { AuditQueryBoundary } from '@/components/audit/AuditQueryBoundary';
import { AuditEventTable } from '@/components/audit/AuditEventTable';
import { AuditCursorPager } from '@/components/audit/AuditCursorPager';

/** Program 2 · P2-8B — Audit Event List. Read-only consumer of the frozen P2-7 API via
 *  AuditQueryClient. Filters live in the URL; the keyset cursor lives in the store (opaque + bound to
 *  the predicate). Suspense wraps useSearchParams (required by the production build). */
export default function AuditListPage() {
  return (
    <Suspense fallback={<ListFallback />}>
      <AuditListContent />
    </Suspense>
  );
}

function AuditListContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const caps = useAuditCapabilities();

  const state = useMemo(() => parseAuditFilters(new URLSearchParams(sp.toString())), [sp]);
  const predicateKey = auditPredicateKey(state);

  const cursor = useAuditCursorStore((s) => s.current);
  const canPrev = useAuditCursorStore((s) => s.stack.length > 0);
  const syncPredicate = useAuditCursorStore((s) => s.syncPredicate);
  const nextCursor = useAuditCursorStore((s) => s.next);
  const prevCursor = useAuditCursorStore((s) => s.prev);

  // Any predicate change (filters/scope/phi/pageSize) resets the cursor stack.
  useEffect(() => { syncPredicate(predicateKey); }, [predicateKey, syncPredicate]);

  const q = useAuditEvents(state, cursor, caps.canRead);
  const items = q.data?.items ?? [];

  const pushUrl = (next: AuditFilterState) => {
    const qs = new URLSearchParams(serializeAuditFilters(next)).toString();
    router.replace(qs ? `/audit?${qs}` : '/audit');
  };

  // Fail-closed: a PHI list failure (5xx/network — NOT 403/404) reverts to base, drops only the PHI
  // cache, and explains PHI is unavailable. Never partially render PHI, never stay silently in PHI.
  const queryClient = useQueryClient();
  const revertedKey = useRef<string>('');
  useEffect(() => {
    if (!q.isError || !shouldPhiFailClosedRevert(state.phi, q.error)) return;
    const key = auditPredicateKey(state);
    if (revertedKey.current === key) return; // guard against double-fire
    revertedKey.current = key;
    queryClient.removeQueries({ queryKey: ['audit-events', key] }); // PHI cache only (predicate encodes phi)
    pushUrl({ ...state, phi: false });
    notify.error('PHI is unavailable right now — showing the standard view.');
  }, [q.isError, q.error, state, queryClient]);

  return (
    <SectionContainer>
      <PageHeader
        eyebrow="Compliance"
        title="Audit Log"
        description="Immutable record of who changed what, when, and under which authority."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            {caps.canSystem && (
              <AuditScopeSelector
                scope={state.scope}
                labIds={state.labIds}
                onScope={(scope) => pushUrl({ ...state, scope, labIds: scope ? state.labIds : undefined })}
                onLabIds={(labIds) => pushUrl({ ...state, labIds })}
              />
            )}
            {caps.canPhi && <PhiRevealControl on={state.phi} onChange={(phi) => pushUrl({ ...state, phi })} />}
          </div>
        }
      />

      {state.phi && <PhiActiveNotice />}

      <AuditFilters value={state} onApply={pushUrl} />

      <AuditQueryBoundary
        unauthorized={!caps.canRead}
        isLoading={caps.canRead && q.isLoading}
        isError={q.isError}
        isEmpty={!q.isLoading && items.length === 0}
        onRetry={() => q.refetch()}
      >
        <AuditEventTable
          events={items}
          phi={state.phi}
          onSelect={(id) => {
            const listQs = new URLSearchParams(serializeAuditFilters(state)).toString();
            const params = new URLSearchParams({ back: listQs ? `/audit?${listQs}` : '/audit' });
            if (state.phi) params.set('phi', '1'); // carry the PHI predicate to detail (transport only)
            router.push(`/audit/${encodeURIComponent(id)}?${params.toString()}`);
          }}
        />
        <AuditCursorPager
          count={items.length}
          canPrev={canPrev}
          canNext={!!q.data?.nextCursor}
          loading={q.isFetching}
          onPrev={() => prevCursor()}
          onNext={() => { if (q.data?.nextCursor) nextCursor(q.data.nextCursor); }}
        />
      </AuditQueryBoundary>
    </SectionContainer>
  );
}

function ListFallback() {
  return (
    <SectionContainer>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </SectionContainer>
  );
}
