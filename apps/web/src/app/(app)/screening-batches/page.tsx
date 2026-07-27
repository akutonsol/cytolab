'use client';

import { useFeatures } from '@/lib/feature-context';
import { FeatureDisabled } from '@/components/FeatureDisabled';

import { useState } from 'react';
import type { AxiosError } from 'axios';
import { Ban, Layers, Plus, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { claimsHavePermission, useAuthStore } from '@/lib/auth';
import {
  Badge, Button, Card, DataToolbar, EmptyState, IconAction, PageHeader, PillSelect, SkeletonRows, Td, Th,
} from '@/components/ui';
import { CreateScreeningBatchDrawer } from '@/components/screening-batches/CreateScreeningBatchDrawer';
import { ScreeningBatchDetailDrawer } from '@/components/screening-batches/ScreeningBatchDetailDrawer';
import {
  DISPOSITION_LABEL, STATUS_LABEL, STATUS_TONE, fmtDate, fmtDateTime,
  type OperationalSummary, type QueueResult, type ScreeningBatchStatus,
} from '@/components/screening-batches/types';

// Read-only console over the Screening Batch owner APIs. Every count comes from
// the server (GET /summary, GET /queue|GET /); nothing is recomputed client-side.
// The API is authoritative for tenancy, lifecycle, membership, and completion.
const SCOPE_OPTS = ['Open', 'All'];
const OPEN_STATUS_OPTS = ['All open', 'Draft', 'Ready', 'Assigned', 'In Screening', 'Completed'];
const ALL_STATUS_OPTS = ['All', 'Draft', 'Ready', 'Assigned', 'In Screening', 'Completed', 'Closed', 'Cancelled'];
const LABEL_TO_STATUS: Record<string, ScreeningBatchStatus> = {
  Draft: 'Draft', Ready: 'Ready', Assigned: 'Assigned', 'In Screening': 'InScreening',
  Completed: 'Completed', Closed: 'Closed', Cancelled: 'Cancelled',
};
const COLS = 8;

export default function ScreeningBatchesPage() {
  const { isEnabled } = useFeatures();
  return isEnabled('SCREENING_BATCHES') ? <ScreeningBatchesPageInner /> : <FeatureDisabled name="Screening Batches" />;
}

function ScreeningBatchesPageInner() {
  const claims = useAuthStore((s) => s.claims);
  const canView = claimsHavePermission(claims, 'record:view');
  const canChange = claimsHavePermission(claims, 'record:change');
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [scope, setScope] = useState('Open');
  const [statusF, setStatusF] = useState('All open');

  const isOpenScope = scope === 'Open';
  const statusOpts = isOpenScope ? OPEN_STATUS_OPTS : ALL_STATUS_OPTS;

  const params: Record<string, string> = {};
  if (LABEL_TO_STATUS[statusF]) params.status = LABEL_TO_STATUS[statusF];

  const summary = useQuery<OperationalSummary>({
    queryKey: ['screening-summary'],
    queryFn: () => api.get('/screening-batches/summary').then((r) => r.data),
    enabled: canView,
    refetchInterval: 30_000,
  });

  const list = useQuery<QueueResult>({
    queryKey: ['screening-batches', scope, params],
    queryFn: () =>
      api.get(isOpenScope ? '/screening-batches/queue' : '/screening-batches', { params }).then((r) => r.data),
    enabled: canView,
    refetchInterval: 30_000,
  });

  const forbidden = (list.isError && (list.error as AxiosError)?.response?.status === 403) || !canView;

  const countLabel = list.data
    ? list.data.truncated
      ? `Showing first ${list.data.cap} of ${list.data.total}`
      : `${list.data.total} batch${list.data.total === 1 ? '' : 'es'}`
    : null;

  const onStatusScopeChange = (next: string) => {
    setScope(next);
    setStatusF(next === 'Open' ? 'All open' : 'All');
  };

  return (
    <div className="w-full">
      <PageHeader
        eyebrow="Laboratory"
        title="Screening Batches"
        description="Cytotechnologist screening batches — grouped cases moving from Draft through screening to Completed. Recorded workflow only."
        actions={
          <>
            {countLabel && !list.isLoading && <span className="text-sm text-text-tertiary">{countLabel}</span>}
            <IconAction
              icon={<RefreshCw size={16} className={list.isFetching ? 'animate-spin' : undefined} />}
              tone="muted"
              aria-label="Refresh screening batches"
              disabled={list.isFetching}
              onClick={() => { list.refetch(); summary.refetch(); }}
            />
            {canChange && (
              <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                <Plus size={15} /> New batch
              </Button>
            )}
          </>
        }
      />

      {/* Operational summary — owner-provided counts only; never recomputed here. */}
      {canView && (
        <section aria-label="Screening summary" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard label="Open batches" value={summary.data?.openBatchCount} loading={summary.isLoading} />
          <SummaryCard label="Open cases" value={summary.data?.openCaseCount} loading={summary.isLoading} />
          <SummaryCard label="Pending dispositions" value={summary.data?.pendingCaseCount} loading={summary.isLoading} />
        </section>
      )}
      {canView && summary.data && (
        <div className="mb-6 flex flex-wrap gap-2" aria-label="Batches by status">
          {summary.data.byStatus.map((b) => (
            <span key={b.status} className="inline-flex items-center gap-1.5 rounded-full border border-lightgray px-3 py-1 text-xs text-text-secondary">
              <Badge tone={STATUS_TONE[b.status]} size="sm">{STATUS_LABEL[b.status]}</Badge>
              <span className="tabular-nums font-medium text-text">{b.count}</span>
            </span>
          ))}
        </div>
      )}

      <Card radius="md" elevation="soft" border="hairline" padding="none">
        <div className="border-b border-lightgray px-6 py-4">
          <DataToolbar
            leading={
              <>
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  View<PillSelect value={scope} options={SCOPE_OPTS} onChange={onStatusScopeChange} />
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  Status<PillSelect value={statusF} options={statusOpts} onChange={setStatusF} />
                </label>
              </>
            }
          />
        </div>

        {forbidden ? (
          <EmptyState
            bare
            className="px-6 py-12"
            icon={<Ban size={28} />}
            title="You don’t have access"
            description="Viewing screening batches requires the record view permission."
          />
        ) : list.isError ? (
          <div className="px-6 py-12 text-center" role="alert">
            <p className="text-sm text-text-secondary">Couldn’t load screening batches.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => list.refetch()}>Retry</Button>
          </div>
        ) : list.isLoading || !list.data ? (
          <table className="w-full">
            <caption className="sr-only">Screening batches, loading</caption>
            <tbody><SkeletonRows rows={6} columns={COLS} /></tbody>
          </table>
        ) : list.data.items.length === 0 ? (
          <EmptyState
            bare
            className="px-6 py-12"
            icon={<Layers size={28} />}
            title={isOpenScope ? 'No open screening batches' : 'No screening batches'}
            description={isOpenScope ? 'No batches are currently Draft through Completed.' : 'No batches match this filter.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Screening batches</caption>
              <thead>
                <tr className="border-b border-lightgray">
                  <Th density="cozy">Batch</Th>
                  <Th density="cozy">Status</Th>
                  <Th density="cozy">Cases</Th>
                  <Th density="cozy">Pending</Th>
                  <Th density="cozy">Screener</Th>
                  <Th density="cozy">Created</Th>
                  <Th density="cozy">Updated</Th>
                  <Th density="cozy"><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((b) => (
                  <tr key={b.id} className="border-b border-lightgray last:border-b-0">
                    <Td density="cozy" nowrap><span className="font-mono text-sm text-text">{b.batchNumber}</span></Td>
                    <Td density="cozy" nowrap><Badge tone={STATUS_TONE[b.status]} size="sm">{STATUS_LABEL[b.status]}</Badge></Td>
                    <Td density="cozy" nowrap><span className="tabular-nums text-sm text-text">{b.caseCount}</span></Td>
                    <Td density="cozy" nowrap>
                      {b.pendingCount > 0
                        ? <Badge tone="neutral" size="sm">{b.pendingCount} {DISPOSITION_LABEL.Pending}</Badge>
                        : <span className="text-sm text-text-tertiary">0</span>}
                    </Td>
                    <Td density="cozy" nowrap>
                      {b.assignedToId
                        ? <span className="font-mono text-xs text-text-secondary" title={b.assignedToId}>{b.assignedToId.slice(0, 8)}</span>
                        : <span className="text-sm text-text-tertiary">—</span>}
                    </Td>
                    <Td density="cozy" nowrap><span className="tabular-nums text-sm text-text-secondary">{fmtDate(b.createdAt)}</span></Td>
                    <Td density="cozy" nowrap><span className="tabular-nums text-sm text-text-secondary">{fmtDateTime(b.updatedAt)}</span></Td>
                    <Td density="cozy" nowrap>
                      <Button variant="secondary" size="sm" onClick={() => setDetailId(b.id)}>
                        {canChange ? 'Manage' : 'View'}
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateScreeningBatchDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(b) => setDetailId(b.id)}
      />
      <ScreeningBatchDetailDrawer id={detailId} canChange={canChange} onClose={() => setDetailId(null)} />
    </div>
  );
}

function SummaryCard({ label, value, loading }: { label: string; value?: number; loading: boolean }) {
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="md">
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-text">
        {loading || value === undefined ? <span className="text-text-tertiary">—</span> : value}
      </p>
    </Card>
  );
}
