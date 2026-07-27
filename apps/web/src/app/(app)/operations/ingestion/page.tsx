'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, EmptyState, IconAction, Skeleton } from '@/components/ui';

/**
 * Program 5B · B5-a — read-only ingestion operational monitoring. Every value is persisted DB truth
 * (tenant-scoped by the API). No source configuration, no enable/disable, no rootPath, no fabricated health.
 * Exception counts deep-link into the B4 reconciliation queue — this page never mutates. READY is shown as
 * READY (processed) and never implies published/viewable.
 */

const DISCOVERY_STATUSES = ['DISCOVERED', 'STABILIZING', 'MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'DUPLICATE', 'INGESTED', 'FAILED', 'RECONCILED'] as const;
type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number];
const EXCEPTION_STATUSES = ['UNMATCHED', 'AMBIGUOUS', 'DUPLICATE', 'FAILED'] as const;

type DiscoveryCounts = Record<DiscoveryStatus, number>;
type ProcessingCounts = Record<'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT', number>;

interface SourceMonitor {
  id: string;
  kind: string;
  enabled: boolean;
  discoveryCounts: DiscoveryCounts;
  reconciliationBacklog: number;
  ingestedCount: number;
  readyCount: number;
  oldestUnresolvedExceptionAt: string | null;
  lastActivityAt: string | null;
  lastIngestedAt: string | null;
  recentFailureAt: string | null;
  recentFailureReason: string | null;
  facts: string[];
}
interface MonitoringResponse {
  asOf: string;
  totals: {
    sources: { total: number; enabled: number; disabled: number };
    discoveries: DiscoveryCounts & { total: number };
    reconciliationBacklog: number;
    processing: ProcessingCounts;
    ready: number;
    oldestUnresolvedExceptionAt: string | null;
    lastActivityAt: string | null;
    lastIngestedAt: string | null;
  };
  sources: SourceMonitor[];
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function IngestionOperationsPage() {
  const { can, hydrated } = useAuth();
  const authorized = can('wsi:reconcile');

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['wsi-ingestion-monitoring'],
    queryFn: () => api.get<MonitoringResponse>('/wsi/ingestion/monitoring').then((r) => r.data),
    enabled: hydrated && authorized,
    refetchInterval: 60_000,
  });

  if (hydrated && !authorized) {
    return (
      <div className="w-full">
        <Header isFetching={false} onRefresh={() => {}} asOf={null} />
        <EmptyState
          icon={<AlertTriangle size={28} />}
          tone="danger"
          announcement="status"
          title="You don’t have ingestion monitoring access."
          description="The ingestion operations view requires the wsi:reconcile permission."
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      <Header isFetching={isFetching} onRefresh={() => refetch()} asOf={data?.asOf ?? null} />

      {isError ? (
        <EmptyState
          icon={<AlertTriangle size={28} />}
          tone="danger"
          announcement="status"
          title="Couldn’t load ingestion monitoring."
          action={<Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>}
        />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          <TotalsCards totals={data.totals} />
          <SourceTable sources={data.sources} />
          <p className="text-sm text-text-tertiary">
            All figures are read from persisted records. Exception counts link into Slide Reconciliation for
            resolution — this view never resolves, retries, or dismisses. READY means a slide finished processing;
            it is not published or viewable until a separate publication action.
          </p>
        </div>
      )}
    </div>
  );
}

function Header({ isFetching, onRefresh, asOf }: { isFetching: boolean; onRefresh: () => void; asOf: string | null }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href="/operations" className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary">
          <ArrowLeft size={15} /> Operations
        </Link>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Ingestion Operations</h1>
        <p className="mt-1 text-sm text-secondary">
          Watch-folder ingestion status across your lab’s sources — discovery, exception backlog, processing, and
          READY outcomes, all from persisted truth.
        </p>
      </div>
      <div className="flex items-center gap-3">
        {asOf && <span className="text-sm text-text-tertiary">Updated {new Date(asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        <IconAction
          icon={<RefreshCw size={16} className={isFetching ? 'animate-spin' : undefined} />}
          tone="muted"
          aria-label="Refresh ingestion monitoring"
          disabled={isFetching}
          onClick={onRefresh}
        />
      </div>
    </div>
  );
}

function TotalsCards({ totals }: { totals: MonitoringResponse['totals'] }) {
  const proc = totals.processing;
  const procActive = proc.QUEUED + proc.RUNNING;
  const procFailed = proc.FAILED + proc.TIMED_OUT;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Sources" value={`${totals.sources.enabled} / ${totals.sources.total}`} sub={`${totals.sources.enabled} enabled · ${totals.sources.disabled} disabled`} />
      <StatCard
        label="Reconciliation backlog"
        value={totals.reconciliationBacklog}
        tone={totals.reconciliationBacklog > 0 ? 'danger' : 'success'}
        sub="unresolved intake exceptions"
        href={totals.reconciliationBacklog > 0 ? '/operations/reconciliation' : undefined}
      />
      <StatCard label="Processing" value={procActive} tone={procFailed > 0 ? 'danger' : 'neutral'} sub={`${procActive} active · ${procFailed} failed/timed-out · ${proc.SUCCEEDED} done`} />
      <StatCard label="READY (unpublished)" value={totals.ready} tone="neutral" sub="processed slides — not yet published" />
    </div>
  );
}

function StatCard({ label, value, sub, tone = 'neutral', href }: { label: string; value: string | number; sub?: string; tone?: 'neutral' | 'danger' | 'success'; href?: string }) {
  const body = (
    <Card radius="md" elevation="soft" border="hairline" padding="lg" className={href ? 'transition-colors hover:border-primary' : undefined}>
      <div className="flex items-center justify-between">
        <span className="text-meta uppercase tracking-wide text-text-tertiary">{label}</span>
        {tone === 'danger' && typeof value === 'number' && value > 0 && <Badge tone="danger" size="xs">action</Badge>}
      </div>
      <div className="mt-2 text-[28px] font-bold leading-none text-text">{value}</div>
      {sub && <p className="mt-2 text-meta text-text-tertiary">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function SourceTable({ sources }: { sources: SourceMonitor[] }) {
  if (sources.length === 0) {
    return (
      <Card radius="md" elevation="soft" border="hairline" padding="none">
        <EmptyState bare className="px-6 py-12" title="No ingestion sources configured" description="When a watch-folder source is configured for your lab, its operational status appears here." />
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {sources.map((s) => (
        <SourceRow key={s.id} source={s} />
      ))}
    </div>
  );
}

function SourceRow({ source: s }: { source: SourceMonitor }) {
  const [open, setOpen] = useState(false);
  const c = s.discoveryCounts;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-text">{s.kind} source</span>
            <span className="font-mono text-meta text-text-tertiary">{s.id.slice(0, 10)}…</span>
            <Badge tone={s.enabled ? 'success' : 'neutral'} size="sm">{s.enabled ? 'Enabled' : 'Disabled'}</Badge>
            {s.reconciliationBacklog > 0 && <Badge tone="danger" size="sm">{s.reconciliationBacklog} to reconcile</Badge>}
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            {c.INGESTED} ingested · {s.readyCount} READY · last activity {fmtWhen(s.lastActivityAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {s.reconciliationBacklog > 0 && (
            <Link href="/operations/reconciliation">
              <Button variant="secondary" size="sm">Reconcile</Button>
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Details'}</Button>
        </div>
      </div>

      {open && (
        <div className="mt-4 border-t border-lightgray pt-4">
          <div className="grid grid-cols-3 gap-x-6 gap-y-3 sm:grid-cols-5">
            {DISCOVERY_STATUSES.map((st) => (
              <div key={st}>
                <dt className="text-meta uppercase tracking-wide text-text-tertiary">{st.toLowerCase()}</dt>
                <dd className={`mt-0.5 text-sm ${(EXCEPTION_STATUSES as readonly string[]).includes(st) && c[st] > 0 ? 'font-semibold text-danger' : 'text-text'}`}>{c[st]}</dd>
              </div>
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-lightgray pt-4 sm:grid-cols-3">
            <Field label="Last ingested" value={fmtWhen(s.lastIngestedAt)} />
            <Field label="Oldest open exception" value={fmtWhen(s.oldestUnresolvedExceptionAt)} />
            <Field label="Recent failure" value={s.recentFailureReason ? `${fmtWhen(s.recentFailureAt)} — ${s.recentFailureReason}` : '—'} />
          </dl>
        </div>
      )}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-meta uppercase tracking-wide text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-sm text-text">{value}</dd>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} radius="md" elevation="soft" border="hairline" padding="lg" className="h-24" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} radius="md" elevation="soft" border="hairline" padding="lg">
            <Skeleton shape="text" width="w-56" />
            <Skeleton shape="text" width="w-80" className="mt-3" />
          </Card>
        ))}
      </div>
    </div>
  );
}
