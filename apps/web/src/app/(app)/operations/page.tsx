'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRealtime } from '@/hooks/useRealtime';
import { Card, IconAction, SkeletonStat, StatCard } from '@/components/ui';
import { AttentionRail } from './AttentionRail';
import { PipelineBoard } from './PipelineBoard';
import type { OperationsOverview } from './types';

export default function OperationsPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['operations-overview'],
    queryFn: () => api.get<OperationsOverview>('/operations/overview').then((r) => r.data),
    // Live-ish backstop; realtime events below invalidate for immediate updates.
    refetchInterval: 30_000,
  });

  // Any lab event that changes the pipeline or an SLA clock re-pulls the board.
  const invalidate = () => qc.invalidateQueries({ queryKey: ['operations-overview'] });
  useRealtime({
    'dashboard:refresh': invalidate,
    'specimen:new': invalidate,
    'specimen:updated': invalidate,
    'result:authorized': invalidate,
    'result:updated': invalidate,
    'escalation:new': invalidate,
  });

  const asOf = data
    ? new Date(data.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">
            Laboratory Operations
          </h1>
          <p className="mt-1 text-sm text-secondary">
            Live command center — what needs attention, what is in flight, and what is falling behind.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {asOf && <span className="text-sm text-text-tertiary">Updated {asOf}</span>}
          <IconAction
            icon={<RefreshCw size={16} className={isFetching ? 'animate-spin' : undefined} />}
            tone="muted"
            aria-label="Refresh operations board"
            disabled={isFetching}
            onClick={() => refetch()}
          />
        </div>
      </div>

      {isLoading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="In flight" value={data.pipeline.totalInFlight} />
            <StatCard
              label="Needs attention"
              value={data.attention.totalAtRisk}
              active={data.attention.totalAtRisk > 0}
            />
            <StatCard label="Urgent" value={data.attention.urgentCount} />
            <StatCard
              label="Turnaround target"
              value={Math.round(data.thresholdHours / 24)}
              suffix="days"
            />
          </div>

          <AttentionRail
            attention={data.attention}
            onOpen={() => router.push('/records')}
          />

          <PipelineBoard pipeline={data.pipeline} />
        </div>
      )}
    </div>
  );
}

/** Shape-matching skeletons — never a false zero while the board loads. */
function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} radius="sm" elevation="sm" border="hairline" padding="md">
            <SkeletonStat />
          </Card>
        ))}
      </div>
      <Card radius="md" elevation="soft" border="hairline" padding="lg" className="h-40" />
      <Card radius="md" elevation="soft" border="hairline" padding="lg" className="h-52" />
    </div>
  );
}
