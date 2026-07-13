'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRealtime } from '@/hooks/useRealtime';
import { Badge, Button, Card, EmptyState, IconAction, Skeleton } from '@/components/ui';
import {
  formatSince,
  type QualityAlertItem,
  type QualityAlertsReport,
  type QualitySeverity,
} from '../types';

// Severity is shown as a TEXT label first; colour is secondary. Zero-orange is
// absolute: the Helix `warning` tone (amber #a16207) anti-aliases into orange on its
// soft background, so it is not used. High reads danger (red); medium reads neutral —
// the "High"/"Medium" label carries the severity without relying on colour.
const SEVERITY_META: Record<QualitySeverity, { label: string; tone: 'danger' | 'neutral' }> = {
  high: { label: 'High', tone: 'danger' },
  medium: { label: 'Medium', tone: 'neutral' },
};

const KIND_LABEL: Record<QualityAlertItem['kind'], string> = {
  'qc-failure': 'QC failure',
  'diagnostic-discordance': 'Discordance',
};

export default function QualityAlertsPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['operations-quality-alerts'],
    queryFn: () => api.get<QualityAlertsReport>('/operations/quality-alerts').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['operations-quality-alerts'] });
  useRealtime({ 'result:authorized': invalidate, 'dashboard:refresh': invalidate });

  const asOf = data ? new Date(data.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/operations"
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary"
          >
            <ArrowLeft size={15} /> Operations
          </Link>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">
            Quality Alerts
          </h1>
          <p className="mt-1 text-sm text-secondary">
            Recorded, open operational quality events — from real QC failures and cytology–histology
            discordance only. Nothing is inferred from a generic status or a delay.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {asOf && <span className="text-sm text-text-tertiary">Updated {asOf}</span>}
          <IconAction
            icon={<RefreshCw size={16} className={isFetching ? 'animate-spin' : undefined} />}
            tone="muted"
            aria-label="Refresh quality alerts"
            disabled={isFetching}
            onClick={() => refetch()}
          />
        </div>
      </div>

      {isError ? (
        <EmptyState
          icon={<AlertTriangle size={28} />}
          tone="danger"
          announcement="status"
          title="Couldn’t load quality alerts."
          action={<Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>}
        />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <Card radius="md" elevation="soft" border="hairline" padding="lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-text">Open quality alerts</span>
                <Badge tone={data.summary.high > 0 ? 'danger' : data.summary.total > 0 ? 'neutral' : 'success'} size="md">
                  {data.summary.total}
                </Badge>
              </div>
              <div className="text-sm text-text-secondary">
                {data.summary.high} high · {data.summary.qcFailures} QC failure
                {data.summary.qcFailures === 1 ? '' : 's'} · {data.summary.discordances} discordance
                {data.summary.discordances === 1 ? '' : 's'}
              </div>
            </div>
          </Card>

          {/* Alerts — or a truthful "all clear" empty state */}
          {data.items.length === 0 ? (
            <Card radius="md" elevation="soft" border="hairline" padding="none">
              <EmptyState
                bare
                className="px-6 py-12"
                title="No open quality alerts"
                description="No unresolved QC failures and no discordant correlations awaiting review."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {data.items.map((item) => (
                <AlertCard key={`${item.kind}:${item.id}`} item={item} asOf={data.asOf} onAction={() => router.push(item.action.route)} />
              ))}
            </div>
          )}

          {/* Sources + honest scope note */}
          <section>
            <h2 className="mb-1 text-base font-bold text-text">Sources</h2>
            <p className="mb-3 text-sm text-text-secondary">Every alert above traces to one of these recorded events.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.sources.map((s) => (
                <Card key={s.kind} radius="md" elevation="soft" border="hairline" padding="lg">
                  <span className="font-semibold text-text">{s.label}</span>
                  <p className="mt-1 text-meta text-text-tertiary">{s.note}</p>
                </Card>
              ))}
            </div>
          </section>

          <p className="text-sm text-text-tertiary">{data.note}</p>
        </div>
      )}
    </div>
  );
}

function AlertCard({
  item,
  asOf,
  onAction,
}: {
  item: QualityAlertItem;
  asOf: string;
  onAction: () => void;
}) {
  const sev = item.severity ? SEVERITY_META[item.severity] : null;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-text">{item.title}</span>
            {sev && <Badge tone={sev.tone} size="sm">{sev.label}</Badge>}
            <Badge tone="neutral" size="xs">{KIND_LABEL[item.kind]}</Badge>
          </div>
          <p className="mt-2 text-sm text-text-secondary">{item.detail}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onAction}>{item.action.label}</Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-lightgray pt-4 sm:grid-cols-4">
        <Field label="Case" value={item.caseRef ?? 'Not recorded'} />
        <Field label="Equipment" value={item.equipmentRef ?? '—'} />
        <Field label="Owner" value={item.owner ?? 'Not recorded'} />
        <Field label="When" value={formatSince(item.occurredAt, asOf)} />
      </dl>
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
      <Card radius="md" elevation="soft" border="hairline" padding="lg" className="h-16" />
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
