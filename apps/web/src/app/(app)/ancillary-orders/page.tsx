'use client';

import { useFeatures } from '@/lib/feature-context';
import { FeatureDisabled } from '@/components/FeatureDisabled';

import { useState } from 'react';
import type { AxiosError } from 'axios';
import { Ban, Microscope, Plus, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { claimsHavePermission, useAuthStore } from '@/lib/auth';
import {
  Badge, Button, Card, DataToolbar, EmptyState, IconAction, PageHeader, PillSelect, SkeletonRows, Td, Th,
} from '@/components/ui';
import { CreateAncillaryOrderDrawer } from '@/components/ancillary/CreateAncillaryOrderDrawer';
import { AncillaryOrderDetailDrawer } from '@/components/ancillary/AncillaryOrderDetailDrawer';

// ── Truthful contract (mirrors the B3 owner allowlist; read-only) ─────────────
// This surface shows ONLY recorded ancillary-order facts. It never claims a stain
// returned, a result is available/reviewed, material was received, or testing
// succeeded/failed. "Completed" here means only that the ancillary owner recorded
// the order as Completed — it is not shown in this OPEN queue.
type AncillaryKind = 'IHC' | 'SpecialStain' | 'Molecular' | 'Cytochemistry' | 'Other';
type AncillaryStatus = 'Ordered' | 'InProcess' | 'Completed' | 'Cancelled';

interface AncillaryOrder {
  id: string;
  recordId: string;
  kind: AncillaryKind;
  target: string;
  status: AncillaryStatus;
  blocksSignOut: boolean;
  orderedAt: string;
  updatedAt: string;
  completedAt: string | null;
  notes: string | null;
}
interface QueueResult { items: AncillaryOrder[]; total: number; cap: number; truncated: boolean }

const KIND_LABEL: Record<AncillaryKind, string> = {
  IHC: 'IHC', SpecialStain: 'Special stain', Molecular: 'Molecular', Cytochemistry: 'Cytochemistry', Other: 'Other',
};
const COLS = 8;

const STATUS_OPTS = ['All open', 'Ordered', 'In Process'];
const KIND_OPTS = ['All kinds', 'IHC', 'Special stain', 'Molecular', 'Cytochemistry', 'Other'];
const BLOCK_OPTS = ['All', 'Blocks Sign-Out', 'Does not block'];
const KIND_TO_ENUM: Record<string, AncillaryKind> = {
  IHC: 'IHC', 'Special stain': 'SpecialStain', Molecular: 'Molecular', Cytochemistry: 'Cytochemistry', Other: 'Other',
};

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function AncillaryOrdersPage() {
  const { isEnabled } = useFeatures();
  return isEnabled('ANCILLARY_ORDERS') ? <AncillaryOrdersPageInner /> : <FeatureDisabled name="Ancillary Orders" />;
}

function AncillaryOrdersPageInner() {
  const claims = useAuthStore((s) => s.claims);
  const canChange = claimsHavePermission(claims, 'record:change');
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusF, setStatusF] = useState('All open');
  const [kindF, setKindF] = useState('All kinds');
  const [blockF, setBlockF] = useState('All');

  // Only approved B3 filters; the queue stays OPEN-only server-side (status can
  // narrow within open, never widen to Completed/Cancelled).
  const params: Record<string, string> = {};
  if (statusF === 'Ordered') params.status = 'Ordered';
  else if (statusF === 'In Process') params.status = 'InProcess';
  if (KIND_TO_ENUM[kindF]) params.kind = KIND_TO_ENUM[kindF];
  if (blockF === 'Blocks Sign-Out') params.blocksSignOut = 'true';
  else if (blockF === 'Does not block') params.blocksSignOut = 'false';

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['ancillary-queue', params],
    queryFn: () => api.get<QueueResult>('/ancillary-orders/queue', { params }).then((r) => r.data),
    refetchInterval: 30_000,
  });
  const forbidden = isError && (error as AxiosError)?.response?.status === 403;

  const countLabel = data
    ? data.truncated
      ? `Showing first ${data.cap} of ${data.total}`
      : `${data.total} open order${data.total === 1 ? '' : 's'}`
    : null;

  return (
    <div className="w-full">
      <PageHeader
        eyebrow="Laboratory"
        title="Open Ancillary Orders"
        description="Ancillary and IHC work orders currently Ordered or In Process, from recorded order data. Completed and cancelled orders are not shown here."
        actions={
          <>
            {countLabel && !isLoading && <span className="text-sm text-text-tertiary">{countLabel}</span>}
            <IconAction
              icon={<RefreshCw size={16} className={isFetching ? 'animate-spin' : undefined} />}
              tone="muted"
              aria-label="Refresh ancillary orders"
              disabled={isFetching}
              onClick={() => refetch()}
            />
            {canChange && (
              <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                <Plus size={15} /> New order
              </Button>
            )}
          </>
        }
      />

      <Card radius="md" elevation="soft" border="hairline" padding="none">
        <div className="border-b border-lightgray px-6 py-4">
          <DataToolbar
            leading={
              <>
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  Status<PillSelect value={statusF} options={STATUS_OPTS} onChange={setStatusF} />
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  Kind<PillSelect value={kindF} options={KIND_OPTS} onChange={setKindF} />
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  Sign-Out<PillSelect value={blockF} options={BLOCK_OPTS} onChange={setBlockF} />
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
            description="Viewing ancillary orders requires the record view permission."
          />
        ) : isError ? (
          <div className="px-6 py-12 text-center" role="alert">
            <p className="text-sm text-text-secondary">Couldn’t load ancillary orders.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : isLoading || !data ? (
          <table className="w-full">
            <caption className="sr-only">Open ancillary orders, loading</caption>
            <tbody>
              <SkeletonRows rows={6} columns={COLS} />
            </tbody>
          </table>
        ) : data.items.length === 0 ? (
          <EmptyState
            bare
            className="px-6 py-12"
            icon={<Microscope size={28} />}
            title="No open ancillary orders"
            description="No ancillary or IHC orders are currently Ordered or In Process."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Open ancillary orders</caption>
              <thead>
                <tr className="border-b border-lightgray">
                  <Th density="cozy">Case</Th>
                  <Th density="cozy">Kind</Th>
                  <Th density="cozy">Target</Th>
                  <Th density="cozy">Status</Th>
                  <Th density="cozy">Sign-Out impact</Th>
                  <Th density="cozy">Ordered</Th>
                  <Th density="cozy">Last updated</Th>
                  <Th density="cozy">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.id} className="border-b border-lightgray last:border-b-0">
                    <Td density="cozy" nowrap>
                      <span className="font-mono text-sm text-text-secondary" title={o.recordId}>
                        {o.recordId.slice(0, 8)}
                      </span>
                    </Td>
                    <Td density="cozy" nowrap>{KIND_LABEL[o.kind]}</Td>
                    <Td density="cozy">{o.target}</Td>
                    <Td density="cozy" nowrap>
                      {o.status === 'Ordered' ? (
                        <Badge tone="neutral" size="sm">Ordered</Badge>
                      ) : (
                        <Badge tone="info" size="sm">In Process</Badge>
                      )}
                    </Td>
                    <Td density="cozy" nowrap>
                      {o.blocksSignOut ? (
                        <Badge tone="danger" size="sm">Blocks Sign-Out</Badge>
                      ) : (
                        <span className="text-sm text-text-tertiary">Does not block</span>
                      )}
                    </Td>
                    <Td density="cozy" nowrap>
                      <span className="tabular-nums text-sm text-text">{fmtDate(o.orderedAt)}</span>
                    </Td>
                    <Td density="cozy" nowrap>
                      <span className="tabular-nums text-sm text-text-secondary">{fmtDateTime(o.updatedAt)}</span>
                    </Td>
                    <Td density="cozy" nowrap>
                      <Button variant="secondary" size="sm" onClick={() => setDetailId(o.id)}>
                        Details
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateAncillaryOrderDrawer open={creating} onClose={() => setCreating(false)} />
      <AncillaryOrderDetailDrawer id={detailId} canChange={canChange} onClose={() => setDetailId(null)} />
    </div>
  );
}
