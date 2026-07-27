'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, EmptyState, IconAction, Input, Modal, Skeleton } from '@/components/ui';

/**
 * Program 5B · B4 — the intake exception & reconciliation queue. Read + enumerated human actions only
 * (resolve / acknowledge-duplicate / retry / dismiss), gated by wsi:reconcile. Truthful post-action state:
 * a resolve/retry that ingests reports INGESTED (still DRAFT/unpublished — never "published" from here); a
 * dismiss/acknowledge reports RECONCILED (human-closed, no slide). Source configuration is NOT here (B5).
 */

type ExceptionStatus = 'UNMATCHED' | 'AMBIGUOUS' | 'DUPLICATE' | 'FAILED';

interface QueueItem {
  id: string;
  status: ExceptionStatus;
  sourceId: string;
  sourceRef: string;
  sizeBytes: number | null;
  sourceChecksum: string | null;
  discoveredAt: string;
  updatedAt: string;
  retryCount: number;
  failureReason: string | null;
  matchEvidence: {
    accession?: string;
    candidateRecordIds?: string[];
    duplicateOf?: { sourceType?: string; priorSlideId?: string | null; priorIngestionId?: string | null };
  } | null;
}
interface QueueResponse {
  items: QueueItem[];
  total: number;
  take: number;
  skip: number;
  summary: Record<ExceptionStatus, number>;
}

const STATUS_META: Record<ExceptionStatus, { label: string; tone: 'danger' | 'neutral' | 'warning'; help: string }> = {
  UNMATCHED: { label: 'Unmatched', tone: 'neutral', help: 'No record matched this file’s accession. Resolve to an explicit record to ingest, or dismiss.' },
  AMBIGUOUS: { label: 'Ambiguous', tone: 'neutral', help: 'The accession resolved to more than one record. Choose exactly one candidate, or dismiss.' },
  DUPLICATE: { label: 'Duplicate', tone: 'neutral', help: 'These exact bytes are already ingested in this lab. Acknowledge to close — no new slide is created.' },
  FAILED: { label: 'Failed', tone: 'danger', help: 'Automated ingestion failed. A retryable failure (matched + checksummed) can be retried; otherwise dismiss.' },
};

const FILTERS: Array<{ key: ExceptionStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'UNMATCHED', label: 'Unmatched' },
  { key: 'AMBIGUOUS', label: 'Ambiguous' },
  { key: 'DUPLICATE', label: 'Duplicate' },
  { key: 'FAILED', label: 'Failed' },
];

function fmtSize(n: number | null): string {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function errText(e: unknown): string {
  const ax = e as AxiosError<{ message?: string | string[] }>;
  const m = ax?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m ?? (e instanceof Error ? e.message : 'Action failed');
}

export default function ReconciliationPage() {
  const { can, hydrated } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ExceptionStatus | 'ALL'>('ALL');
  const [active, setActive] = useState<QueueItem | null>(null);

  const authorized = can('wsi:reconcile');

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['wsi-reconciliation', filter],
    queryFn: () =>
      api
        .get<QueueResponse>('/wsi/reconciliation', { params: filter === 'ALL' ? {} : { status: filter } })
        .then((r) => r.data),
    enabled: hydrated && authorized,
    refetchInterval: 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['wsi-reconciliation'] });

  if (hydrated && !authorized) {
    return (
      <div className="w-full">
        <Header isFetching={false} onRefresh={() => {}} />
        <EmptyState
          icon={<AlertTriangle size={28} />}
          tone="danger"
          announcement="status"
          title="You don’t have reconciliation access."
          description="The intake reconciliation queue requires the wsi:reconcile permission."
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      <Header isFetching={isFetching} onRefresh={() => refetch()} />

      {isError ? (
        <EmptyState
          icon={<AlertTriangle size={28} />}
          tone="danger"
          announcement="status"
          title="Couldn’t load the reconciliation queue."
          action={<Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>}
        />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          <SummaryBar summary={data.summary} active={filter} onFilter={setFilter} />

          {data.items.length === 0 ? (
            <Card radius="md" elevation="soft" border="hairline" padding="none">
              <EmptyState
                bare
                className="px-6 py-12"
                title="No open intake exceptions"
                description="Every discovered file has been matched, ingested, or reconciled. New exceptions from the watch-folder appear here."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {data.items.map((item) => (
                <ExceptionRow key={item.id} item={item} onAct={() => setActive(item)} />
              ))}
            </div>
          )}

          <p className="text-sm text-text-tertiary">
            Reconciliation records the operator’s decision and reuses the accepted ingestion pipeline. It never
            publishes: an ingested slide reaches READY as a DRAFT and stays unpublished until a separate
            publication authority acts.
          </p>
        </div>
      )}

      {active && (
        <ActionModal
          item={active}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function Header({ isFetching, onRefresh }: { isFetching: boolean; onRefresh: () => void }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href="/operations" className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary">
          <ArrowLeft size={15} /> Operations
        </Link>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Slide Reconciliation</h1>
        <p className="mt-1 text-sm text-secondary">
          Automated watch-folder ingestion classified these files as exceptions. Resolve, acknowledge, retry, or
          dismiss each one — every action is attributed to you and audited.
        </p>
      </div>
      <IconAction
        icon={<RefreshCw size={16} className={isFetching ? 'animate-spin' : undefined} />}
        tone="muted"
        aria-label="Refresh reconciliation queue"
        disabled={isFetching}
        onClick={onRefresh}
      />
    </div>
  );
}

function SummaryBar({
  summary,
  active,
  onFilter,
}: {
  summary: Record<ExceptionStatus, number>;
  active: ExceptionStatus | 'ALL';
  onFilter: (f: ExceptionStatus | 'ALL') => void;
}) {
  const total = summary.UNMATCHED + summary.AMBIGUOUS + summary.DUPLICATE + summary.FAILED;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count = f.key === 'ALL' ? total : summary[f.key];
          const on = active === f.key;
          return (
            <button
              key={f.key}
              onClick={() => onFilter(f.key)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                on ? 'border-primary bg-primary/5 text-primary' : 'border-lightgray text-text-secondary hover:text-text'
              }`}
            >
              {f.label}
              <Badge tone={f.key === 'FAILED' && count > 0 ? 'danger' : 'neutral'} size="xs">{count}</Badge>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ExceptionRow({ item, onAct }: { item: QueueItem; onAct: () => void }) {
  const meta = STATUS_META[item.status];
  const actionLabel =
    item.status === 'DUPLICATE' ? 'Review duplicate' : item.status === 'FAILED' ? 'Retry or dismiss' : 'Resolve';
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-text">{item.sourceRef}</span>
            <Badge tone={meta.tone === 'warning' ? 'neutral' : meta.tone} size="sm">{meta.label}</Badge>
            {item.retryCount > 0 && <Badge tone="neutral" size="xs">retry ×{item.retryCount}</Badge>}
          </div>
          <p className="mt-2 text-sm text-text-secondary">{meta.help}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onAct}>{actionLabel}</Button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-lightgray pt-4 sm:grid-cols-4">
        <Field label="Accession" value={item.matchEvidence?.accession ?? '—'} />
        <Field label="Size" value={fmtSize(item.sizeBytes)} />
        <Field label="Checksum" value={item.sourceChecksum ? `${item.sourceChecksum.slice(0, 12)}…` : '—'} mono />
        <Field label="Discovered" value={new Date(item.discoveredAt).toLocaleString()} />
      </dl>
      {item.status === 'FAILED' && item.failureReason && (
        <p className="mt-3 text-meta text-text-tertiary">Reason: {item.failureReason}</p>
      )}
    </Card>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-meta uppercase tracking-wide text-text-tertiary">{label}</dt>
      <dd className={`mt-0.5 text-sm text-text ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

/** The confirmation + action surface for one exception. Enumerated controls only — no free-form transition. */
function ActionModal({ item, onClose, onDone }: { item: QueueItem; onClose: () => void; onDone: () => void }) {
  const meta = STATUS_META[item.status];
  const candidates = item.matchEvidence?.candidateRecordIds ?? [];
  const [recordId, setRecordId] = useState(item.status === 'AMBIGUOUS' && candidates.length ? candidates[0] : '');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const shared = { onError: (e: unknown) => setErr(errText(e)), onSuccess: onDone };
  const resolve = useMutation({ mutationFn: () => api.post(`/wsi/reconciliation/${item.id}/resolve`, { recordId: recordId.trim() }), ...shared });
  const acknowledge = useMutation({ mutationFn: () => api.post(`/wsi/reconciliation/${item.id}/acknowledge-duplicate`, {}), ...shared });
  const retry = useMutation({ mutationFn: () => api.post(`/wsi/reconciliation/${item.id}/retry`, {}), ...shared });
  const dismiss = useMutation({ mutationFn: () => api.post(`/wsi/reconciliation/${item.id}/dismiss`, reason.trim() ? { reason: reason.trim() } : {}), ...shared });

  const busy = resolve.isPending || acknowledge.isPending || retry.isPending || dismiss.isPending;

  const footer = (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
      {(item.status === 'UNMATCHED' || item.status === 'AMBIGUOUS') && (
        <Button
          variant="primary"
          size="sm"
          loading={resolve.isPending}
          disabled={busy || !recordId.trim()}
          onClick={() => { setErr(null); resolve.mutate(); }}
        >
          Resolve &amp; ingest
        </Button>
      )}
      {item.status === 'DUPLICATE' && (
        <Button variant="primary" size="sm" loading={acknowledge.isPending} disabled={busy} onClick={() => { setErr(null); acknowledge.mutate(); }}>
          Acknowledge duplicate
        </Button>
      )}
      {item.status === 'FAILED' && (
        <Button variant="primary" size="sm" loading={retry.isPending} disabled={busy} onClick={() => { setErr(null); retry.mutate(); }}>
          Retry ingestion
        </Button>
      )}
      <Button variant="danger" size="sm" loading={dismiss.isPending} disabled={busy} onClick={() => { setErr(null); dismiss.mutate(); }}>
        Dismiss
      </Button>
    </div>
  );

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`${meta.label}: ${item.sourceRef}`} size="md" footer={footer}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">{meta.help}</p>

        {item.status === 'AMBIGUOUS' && candidates.length > 0 && (
          <div>
            <p className="mb-2 text-meta uppercase tracking-wide text-text-tertiary">Candidate records (choose exactly one)</p>
            <div className="space-y-2">
              {candidates.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 rounded-md border border-lightgray px-3 py-2 text-sm">
                  <input type="radio" name="candidate" checked={recordId === c} onChange={() => setRecordId(c)} />
                  <span className="font-mono text-text">{c}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {item.status === 'UNMATCHED' && (
          <div>
            <label className="mb-1 block text-meta uppercase tracking-wide text-text-tertiary">Record ID to ingest into</label>
            <Input value={recordId} onChange={(e) => setRecordId(e.target.value)} placeholder="Record ID (must belong to this lab)" />
            <p className="mt-1 text-meta text-text-tertiary">The backend verifies the record exists in your lab before ingesting.</p>
          </div>
        )}

        {item.status === 'DUPLICATE' && item.matchEvidence?.duplicateOf && (
          <div className="rounded-md border border-lightgray px-3 py-2 text-sm">
            <p className="text-meta uppercase tracking-wide text-text-tertiary">Already ingested as</p>
            <p className="mt-0.5 font-mono text-text">{item.matchEvidence.duplicateOf.priorSlideId ?? item.matchEvidence.duplicateOf.priorIngestionId ?? 'a prior ingestion'}</p>
            <p className="mt-1 text-meta text-text-tertiary">Acknowledging closes this exception without creating a new slide.</p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-meta uppercase tracking-wide text-text-tertiary">Note (optional — kept with a dismissal)</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong folder; will re-drop" />
        </div>

        {err && <p className="text-sm text-danger" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <Card radius="md" elevation="soft" border="hairline" padding="lg" className="h-14" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} radius="md" elevation="soft" border="hairline" padding="lg">
            <Skeleton shape="text" width="w-56" />
            <Skeleton shape="text" width="w-80" className="mt-3" />
          </Card>
        ))}
      </div>
    </div>
  );
}
