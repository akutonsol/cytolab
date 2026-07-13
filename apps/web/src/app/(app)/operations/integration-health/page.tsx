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
  type IntegrationHealthReport,
  type IntegrationInterface,
  type InterfaceEnvironment,
  type InterfaceHealth,
} from '../types';

const HEALTH_META: Record<InterfaceHealth, { label: string; tone: 'success' | 'danger' | 'neutral' }> = {
  operational: { label: 'Operational', tone: 'success' },
  degraded: { label: 'Degraded', tone: 'danger' },
  unknown: { label: 'Unknown', tone: 'neutral' },
  disabled: { label: 'Disabled', tone: 'neutral' },
};

// Environment is metadata (a separate axis), never health.
const ENV_META: Record<InterfaceEnvironment, { label: string; tone: 'neutral' | 'info' }> = {
  production: { label: 'Production', tone: 'neutral' },
  sandbox: { label: 'Sandbox', tone: 'info' },
};

const OVERALL_META: Record<IntegrationHealthReport['overall'], { label: string; tone: 'success' | 'danger' | 'neutral' }> = {
  operational: { label: 'Operational', tone: 'success' },
  degraded: { label: 'Degraded', tone: 'danger' },
  unknown: { label: 'Health unknown', tone: 'neutral' },
  none: { label: 'No integrations configured', tone: 'neutral' },
};

export default function IntegrationHealthPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['operations-integration-health'],
    queryFn: () => api.get<IntegrationHealthReport>('/operations/integration-health').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['operations-integration-health'] });
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
            Integration Health
          </h1>
          <p className="mt-1 text-sm text-secondary">
            Whether PathOS is reliably delivering data across its external interfaces — from real
            transmission and connection signals only.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {asOf && <span className="text-sm text-text-tertiary">Updated {asOf}</span>}
          <IconAction
            icon={<RefreshCw size={16} className={isFetching ? 'animate-spin' : undefined} />}
            tone="muted"
            aria-label="Refresh integration health"
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
          title="Couldn’t load integration health."
          action={<Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>}
        />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          {/* Overall state — truthful; "unknown" is a first-class outcome. */}
          <Card radius="md" elevation="soft" border="hairline" padding="lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-text">Overall</span>
                <Badge tone={OVERALL_META[data.overall].tone} size="md">
                  {OVERALL_META[data.overall].label}
                </Badge>
              </div>
              <div className="text-sm text-text-secondary">
                {data.summary.total} interface{data.summary.total === 1 ? '' : 's'} ·{' '}
                {data.summary.operational} operational · {data.summary.degraded} degraded ·{' '}
                {data.summary.unknown} unknown · {data.summary.disabled} disabled ·{' '}
                {data.summary.sandbox} sandbox
              </div>
            </div>
          </Card>

          {/* Interfaces */}
          <section>
            <h2 className="mb-3 text-base font-bold text-text">Interfaces</h2>
            {data.interfaces.length === 0 ? (
              <Card radius="md" elevation="soft" border="hairline" padding="none">
                <EmptyState
                  bare
                  className="px-6 py-12"
                  title="No integrations configured"
                  description="No external interfaces are set up for this lab yet."
                />
              </Card>
            ) : (
              <div className="space-y-3">
                {data.interfaces.map((i) => (
                  <InterfaceCard key={i.id} item={i} asOf={data.asOf} onAction={() => router.push(i.action.route)} />
                ))}
              </div>
            )}
          </section>

          {/* Other activity signals — explicitly NOT monitored interfaces. */}
          <section>
            <h2 className="mb-1 text-base font-bold text-text">Other activity signals</h2>
            <p className="mb-3 text-sm text-text-secondary">
              Recorded activity timestamps — not monitored connections, and not a health status.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.activity.map((a) => (
                <Card key={a.key} radius="md" elevation="soft" border="hairline" padding="lg">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-text">{a.label}</span>
                    <span className="tabular-nums text-sm text-text-secondary">
                      {formatSince(a.lastActivityAt, data.asOf)}
                    </span>
                  </div>
                  <p className="mt-1 text-meta text-text-tertiary">{a.note}</p>
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

function InterfaceCard({
  item,
  asOf,
  onAction,
}: {
  item: IntegrationInterface;
  asOf: string;
  onAction: () => void;
}) {
  const meta = HEALTH_META[item.health];
  const env = ENV_META[item.environment];
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text">{item.name}</span>
            <Badge tone={meta.tone} size="sm">{meta.label}</Badge>
            <Badge tone={env.tone} size="xs">{env.label}</Badge>
          </div>
          <div className="mt-0.5 text-sm text-text-secondary">
            {item.type} · {item.system}
          </div>
          <p className="mt-2 text-sm text-text-secondary">{item.detail}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onAction}>{item.action.label}</Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-lightgray pt-4 sm:grid-cols-4">
        <Field label="Last successful delivery" value={formatSince(item.lastSuccessAt, asOf)} />
        <Field
          label="Last connection test"
          value={
            item.lastTest.at
              ? `${formatSince(item.lastTest.at, asOf)}${item.lastTest.failed ? ' · failed' : ''}`
              : 'Never tested'
          }
        />
        <Field label="Transmissions" value={`${item.counts.success}/${item.counts.total} ok · ${item.counts.failed} failed`} />
        <Field label="Affected workflow" value={item.affectedWorkflow} />
      </dl>

      {item.lastError && (
        <div className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {item.lastError.responseCode ? `HTTP ${item.lastError.responseCode} · ` : ''}
          {item.lastError.message ?? 'Transmission failed'}
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
      <Card radius="md" elevation="soft" border="hairline" padding="lg" className="h-16" />
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} radius="md" elevation="soft" border="hairline" padding="lg">
            <Skeleton shape="text" width="w-48" />
            <Skeleton shape="text" width="w-72" className="mt-3" />
          </Card>
        ))}
      </div>
    </div>
  );
}
