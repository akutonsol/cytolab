'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Drawer, SkeletonText, fieldClass } from '@/components/ui';
import { errorMessage, notify } from '@/lib/notify';

// Detail shows ONLY the B3 response allowlist. No labId / orderedById / nested
// Record / patient / result / report / diagnosis. Lifecycle actions mirror the
// owner matrix for usability, but the API is authoritative and revalidates.
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

const KIND_LABEL: Record<AncillaryKind, string> = {
  IHC: 'IHC', SpecialStain: 'Special stain', Molecular: 'Molecular', Cytochemistry: 'Cytochemistry', Other: 'Other',
};
const STATUS_LABEL: Record<AncillaryStatus, string> = {
  Ordered: 'Ordered', InProcess: 'In Process', Completed: 'Completed', Cancelled: 'Cancelled',
};
const OPEN: AncillaryStatus[] = ['Ordered', 'InProcess'];

// UI-convenience mirror of the owner transition matrix. The server rejects any
// illegal transition regardless of what the client shows.
const ACTIONS: Record<AncillaryStatus, { to: AncillaryStatus; label: string; destructive?: boolean }[]> = {
  Ordered: [{ to: 'InProcess', label: 'Start' }, { to: 'Cancelled', label: 'Cancel order', destructive: true }],
  InProcess: [{ to: 'Completed', label: 'Complete' }, { to: 'Cancelled', label: 'Cancel order', destructive: true }],
  Completed: [],
  Cancelled: [],
};

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function StatusBadge({ s }: { s: AncillaryStatus }) {
  const tone = s === 'InProcess' ? 'info' : s === 'Completed' ? 'success' : s === 'Cancelled' ? 'muted' : 'neutral';
  return <Badge tone={tone as never} size="sm">{STATUS_LABEL[s]}</Badge>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-lightgray py-2 last:border-b-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-right text-sm text-text">{children}</span>
    </div>
  );
}

export function AncillaryOrderDetailDrawer({
  id, canChange, onClose,
}: { id: string | null; canChange: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const open = !!id;
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [reason, setReason] = useState('');

  const { data: order, isLoading, isError, refetch } = useQuery<AncillaryOrder>({
    queryKey: ['ancillary-order', id],
    queryFn: () => api.get(`/ancillary-orders/${id}`).then((r) => r.data),
    enabled: open,
  });

  const transition = useMutation({
    mutationFn: (vars: { status: AncillaryStatus; notes?: string }) =>
      api.patch(`/ancillary-orders/${id}/status`, vars),
    onSuccess: () => {
      notify.success('Order updated');
      qc.invalidateQueries({ queryKey: ['ancillary-queue'] });
      refetch();
      setConfirmingCancel(false);
      setReason('');
    },
    // Truthful: show the server's business-rule error and re-sync to real state.
    onError: (e) => { notify.error(errorMessage(e, 'Could not update the order')); refetch(); },
  });

  const close = () => { setConfirmingCancel(false); setReason(''); onClose(); };
  const actions = order ? ACTIONS[order.status] : [];
  const isOpen = order ? OPEN.includes(order.status) : false;

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) close(); }}
      title="Ancillary order"
      description={order ? `${KIND_LABEL[order.kind]} · ${order.target}` : undefined}
      width="md"
      footer={
        canChange && order && actions.length > 0 && !confirmingCancel ? (
          <div className="flex justify-end gap-2">
            {actions.map((a) =>
              a.destructive ? (
                <Button key={a.to} variant="danger" disabled={transition.isPending} onClick={() => setConfirmingCancel(true)}>
                  {a.label}
                </Button>
              ) : (
                <Button key={a.to} variant="primary" disabled={transition.isPending} onClick={() => transition.mutate({ status: a.to })}>
                  {transition.isPending ? 'Working…' : a.label}
                </Button>
              ),
            )}
          </div>
        ) : undefined
      }
    >
      {isLoading || !order ? (
        <div className="space-y-3"><SkeletonText lines={6} /></div>
      ) : isError ? (
        <div className="py-8 text-center" role="alert">
          <p className="text-sm text-text-secondary">Couldn’t load this order.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : (
        <div>
          <Row label="Status"><StatusBadge s={order.status} /></Row>
          <Row label="Kind">{KIND_LABEL[order.kind]}</Row>
          <Row label="Target">{order.target}</Row>
          <Row label="Sign-Out impact">
            {order.blocksSignOut ? <Badge tone="danger" size="sm">Blocks Sign-Out</Badge> : <span className="text-text-tertiary">Does not block</span>}
          </Row>
          <Row label="Ordered">{fmt(order.orderedAt)}</Row>
          <Row label="Last updated">{fmt(order.updatedAt)}</Row>
          {order.status === 'Completed' && <Row label="Completed">{fmt(order.completedAt)}</Row>}
          {order.notes && <Row label="Notes"><span className="whitespace-pre-wrap">{order.notes}</span></Row>}
          <Row label="Case">
            <Link href={`/records/${order.recordId}`} className="font-medium text-primary hover:underline">Open record</Link>
          </Row>

          {/* Truthful sign-out explanation — open orders only. */}
          {order.blocksSignOut && isOpen && (
            <p className="mt-4 text-meta text-text-tertiary">
              While this order remains Ordered or In Process, it prevents authorization of the case’s result sheet.
            </p>
          )}
          {order.blocksSignOut && !isOpen && (
            <p className="mt-4 text-meta text-text-tertiary">
              Marked to block sign-out, but no longer blocking — the order is {STATUS_LABEL[order.status]}.
            </p>
          )}
          {!canChange && actions.length > 0 && (
            <p className="mt-4 text-meta text-text-tertiary">You have view-only access; changing this order requires the record change permission.</p>
          )}
          {(order.status === 'Completed' || order.status === 'Cancelled') && (
            <p className="mt-4 text-meta text-text-tertiary">This order is {STATUS_LABEL[order.status]}; no further actions are available.</p>
          )}

          {/* Cancel confirmation (destructive) with an optional reason note. */}
          {confirmingCancel && (
            <div className="mt-5 rounded-xl border border-lightgray p-4">
              <p className="text-sm font-semibold text-text">Cancel this order?</p>
              <p className="mt-1 text-meta text-text-tertiary">This records the order as Cancelled. It cannot be reopened.</p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Reason (optional)"
                aria-label="Cancellation reason"
                className={`mt-3 ${fieldClass()}`}
              />
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setConfirmingCancel(false); setReason(''); }}>Keep order</Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={transition.isPending}
                  onClick={() => transition.mutate({ status: 'Cancelled', notes: reason.trim() || undefined })}
                >
                  {transition.isPending ? 'Cancelling…' : 'Confirm cancellation'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
