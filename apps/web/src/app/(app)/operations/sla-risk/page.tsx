'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRealtime } from '@/hooks/useRealtime';
import {
  Badge, Button, Card, cn, EmptyState, IconAction, SkeletonRows, SkeletonStat, StatCard, Td, Th, Tr,
} from '@/components/ui';
import { formatAge, formatTimeToBreach, type SlaRiskDetail } from '../types';

const COLS = 7;

export default function SlaRiskPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['operations-sla-risk'],
    queryFn: () => api.get<SlaRiskDetail>('/operations/sla-risk').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['operations-sla-risk'] });
  useRealtime({
    'dashboard:refresh': invalidate,
    'specimen:new': invalidate,
    'specimen:updated': invalidate,
    'result:authorized': invalidate,
    'result:updated': invalidate,
    'escalation:new': invalidate,
  });

  const asOf = data ? new Date(data.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  const targetDays = data ? Math.round(data.thresholdHours / 24) : null;

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
            SLA Risk
          </h1>
          <p className="mt-1 text-sm text-secondary">
            Cases at risk of — or past — the turnaround target, ranked by urgency.
            {data && (
              <>
                {' '}Turnaround target {targetDays} day{targetDays === 1 ? '' : 's'} ({data.thresholdHours}h)
                {' · '}{data.summary.inFlight} in flight.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {asOf && <span className="text-sm text-text-tertiary">Updated {asOf}</span>}
          <IconAction
            icon={<RefreshCw size={16} className={isFetching ? 'animate-spin' : undefined} />}
            tone="muted"
            aria-label="Refresh SLA risk"
            disabled={isFetching}
            onClick={() => refetch()}
          />
        </div>
      </div>

      {/* Summary — three clearly distinct classes. */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {isLoading || !data ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} radius="sm" elevation="sm" border="hairline" padding="md">
              <SkeletonStat />
            </Card>
          ))
        ) : (
          <>
            <StatCard label="Breached" value={data.summary.breached} active={data.summary.breached > 0} />
            <StatCard label="At risk" value={data.summary.atRisk} />
            <StatCard label="Within target" value={data.summary.withinTarget} />
          </>
        )}
      </div>

      <Card radius="md" elevation="soft" border="hairline" padding="none">
        <div className="border-b border-lightgray px-6 py-4">
          <h2 className="text-base font-bold text-text">At-risk cases</h2>
          {data && !isLoading && (
            <p className="mt-0.5 text-sm text-text-secondary">
              {data.items.length} case{data.items.length === 1 ? '' : 's'} need attention, ranked by breach then urgency.
            </p>
          )}
        </div>

        {isError ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-text-secondary">Couldn’t load SLA risk data.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : isLoading || !data ? (
          <table className="w-full">
            <tbody>
              <SkeletonRows rows={6} columns={COLS} />
            </tbody>
          </table>
        ) : data.items.length === 0 ? (
          <EmptyState
            bare
            className="px-6 py-12"
            icon={<ShieldCheck size={28} />}
            title="No cases at risk"
            description={`All ${data.summary.inFlight} cases in flight are within the turnaround target.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-lightgray">
                  <Th density="cozy">Case</Th>
                  <Th density="cozy">Stage</Th>
                  <Th density="cozy">Risk</Th>
                  <Th density="cozy">Time to breach</Th>
                  <Th density="cozy">Owner</Th>
                  <Th density="cozy">Blocker</Th>
                  <Th density="cozy">Action</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-b border-lightgray last:border-b-0">
                    <Td density="cozy" nowrap>
                      <span className="font-semibold tabular-nums text-text">{item.caseRef}</span>
                    </Td>
                    <Td density="cozy" nowrap>{item.stage}</Td>
                    <Td density="cozy" nowrap>
                      {item.risk === 'breached' ? (
                        <Badge tone="danger" size="sm">Breached</Badge>
                      ) : (
                        <Badge domain="priority-high" size="sm">At risk</Badge>
                      )}
                      {item.urgent && (
                        <Badge domain="priority-urgent" size="xs" className="ml-1.5">Urgent</Badge>
                      )}
                    </Td>
                    <Td density="cozy" nowrap>
                      <span
                        className={cn(
                          'tabular-nums text-sm font-medium',
                          item.remainingHours <= 0 ? 'text-danger' : 'text-text',
                        )}
                      >
                        {formatTimeToBreach(item)}
                      </span>
                      <span className="ml-2 text-meta text-text-tertiary">{item.budgetPct}%</span>
                    </Td>
                    <Td density="cozy" nowrap>
                      {item.owner ?? <span className="text-text-tertiary">Unassigned</span>}
                    </Td>
                    <Td density="cozy">
                      {item.blocker ?? (
                        <span className="text-text-tertiary">No blocking dependency recorded</span>
                      )}
                    </Td>
                    <Td density="cozy" nowrap>
                      <Button variant="secondary" size="sm" onClick={() => router.push(item.action.route)}>
                        {item.action.label}
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
