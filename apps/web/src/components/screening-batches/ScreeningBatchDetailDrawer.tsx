'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { Badge, Button, Drawer, SkeletonText, Td, Th, fieldClass } from '@/components/ui';
import { errorMessage, notify } from '@/lib/notify';
import {
  DISPOSITION_LABEL,
  DISPOSITION_TONE,
  STATUS_ACTIONS,
  STATUS_LABEL,
  STATUS_TONE,
  fmtDateTime,
  type RecordableDisposition,
  type ScreeningBatchDetail,
  type ScreeningBatchStatus,
} from './types';

const RECORDABLE: { value: RecordableDisposition; label: string }[] = [
  { value: 'Screened', label: 'Screened' },
  { value: 'Flagged', label: 'Flagged' },
  { value: 'QCSelected', label: 'QC Selected' },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-lightgray py-2 last:border-b-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-right text-sm text-text">{children}</span>
    </div>
  );
}

export function ScreeningBatchDetailDrawer({
  id,
  canChange,
  onClose,
}: {
  id: string | null;
  canChange: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const open = !!id;
  const [recordRef, setRecordRef] = useState('');
  const [assignee, setAssignee] = useState('');
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const { data: batch, isLoading, isError, refetch } = useQuery<ScreeningBatchDetail>({
    queryKey: ['screening-batch', id],
    queryFn: () => api.get(`/screening-batches/${id}`).then((r) => r.data),
    enabled: open,
  });

  // Owner-backed Record selector (record:view) — the same read the ancillary and
  // reagents workspaces use. Resolves a typed lab number to its recordId; a
  // cross-lab or unknown value simply does not resolve (server re-checks anyway).
  const { data: recPage } = useQuery<Paginated<{ id: string; labNumber?: string | null; identifier?: string | null }>>({
    queryKey: ['screening-record-select'],
    queryFn: () => api.get('/specimens', { params: { pageSize: 300 } }).then((r) => r.data),
    enabled: open && canChange,
  });
  const records = recPage?.data ?? [];
  const resolvedRecordId = records.find((r) => (r.labNumber ?? r.identifier) === recordRef.trim())?.id ?? null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['screening-batches'] });
    qc.invalidateQueries({ queryKey: ['screening-summary'] });
    refetch();
  };

  const addCase = useMutation({
    mutationFn: () => api.post(`/screening-batches/${id}/cases`, { recordId: resolvedRecordId }),
    onSuccess: () => { notify.success('Case added'); setRecordRef(''); invalidate(); },
    onError: (e) => { notify.error(errorMessage(e, 'Could not add the case')); refetch(); },
  });
  const removeCase = useMutation({
    mutationFn: (caseId: string) => api.delete(`/screening-batches/${id}/cases/${caseId}`),
    onSuccess: () => { notify.success('Case removed'); invalidate(); },
    onError: (e) => { notify.error(errorMessage(e, 'Could not remove the case')); refetch(); },
  });
  const setDisposition = useMutation({
    mutationFn: (vars: { caseId: string; disposition: RecordableDisposition }) =>
      api.patch(`/screening-batches/${id}/cases/${vars.caseId}/disposition`, { disposition: vars.disposition }),
    onSuccess: () => { notify.success('Disposition recorded'); invalidate(); },
    onError: (e) => { notify.error(errorMessage(e, 'Could not record the disposition')); refetch(); },
  });
  const assign = useMutation({
    mutationFn: () => api.patch(`/screening-batches/${id}/assignment`, { assignedToId: assignee.trim() }),
    onSuccess: () => { notify.success('Screener assigned'); setAssignee(''); invalidate(); },
    onError: (e) => { notify.error(errorMessage(e, 'Could not assign the batch')); refetch(); },
  });
  const transition = useMutation({
    mutationFn: (status: ScreeningBatchStatus) => api.patch(`/screening-batches/${id}/status`, { status }),
    onSuccess: () => { notify.success('Batch updated'); setConfirmingCancel(false); invalidate(); },
    onError: (e) => { notify.error(errorMessage(e, 'Could not update the batch')); setConfirmingCancel(false); refetch(); },
  });

  const close = () => { setRecordRef(''); setAssignee(''); setConfirmingCancel(false); onClose(); };

  const status = batch?.status;
  const isDraft = status === 'Draft';
  const isScreening = status === 'InScreening';
  const canAssign = !!status && ['Draft', 'Ready', 'Assigned'].includes(status);
  const actions = status ? STATUS_ACTIONS[status] : [];
  const completeBlocked = !!batch && (batch.caseCount === 0 || batch.pendingCount > 0);
  const anyPending = transition.isPending || addCase.isPending || removeCase.isPending || setDisposition.isPending || assign.isPending;

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) close(); }}
      title={batch ? `Batch ${batch.batchNumber}` : 'Screening batch'}
      description={batch ? `${STATUS_LABEL[batch.status]} · ${batch.caseCount} case${batch.caseCount === 1 ? '' : 's'}` : undefined}
      width="lg"
      footer={
        canChange && batch && actions.length > 0 && !confirmingCancel ? (
          <div className="flex flex-wrap justify-end gap-2">
            {actions.map((a) => {
              const isComplete = a.to === 'Completed';
              if (a.destructive) {
                return (
                  <Button key={a.to} variant="danger" disabled={anyPending} onClick={() => setConfirmingCancel(true)}>
                    {a.label}
                  </Button>
                );
              }
              return (
                <Button
                  key={a.to}
                  variant="primary"
                  disabled={anyPending || (isComplete && completeBlocked)}
                  title={isComplete && completeBlocked ? 'Every case must have a disposition first' : undefined}
                  onClick={() => transition.mutate(a.to)}
                >
                  {transition.isPending ? 'Working…' : a.label}
                </Button>
              );
            })}
          </div>
        ) : undefined
      }
    >
      {isLoading || !batch ? (
        <div className="space-y-3"><SkeletonText lines={8} /></div>
      ) : isError ? (
        <div className="py-8 text-center" role="alert">
          <p className="text-sm text-text-secondary">Couldn’t load this batch.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Batch facts — allowlist only. */}
          <section>
            <Row label="Status"><Badge tone={STATUS_TONE[batch.status]} size="sm">{STATUS_LABEL[batch.status]}</Badge></Row>
            <Row label="Cases">{batch.caseCount}</Row>
            <Row label="Pending disposition">{batch.pendingCount}</Row>
            <Row label="Assigned screener">
              {batch.assignedToId ? <span className="font-mono text-sm">{batch.assignedToId}</span> : '—'}
            </Row>
            <Row label="Assigned">{fmtDateTime(batch.assignedAt)}</Row>
            <Row label="Created">{fmtDateTime(batch.createdAt)}</Row>
            <Row label="Started">{fmtDateTime(batch.startedAt)}</Row>
            <Row label="Completed">{fmtDateTime(batch.completedAt)}</Row>
            <Row label="Closed">{fmtDateTime(batch.closedAt)}</Row>
            {batch.notes && <Row label="Notes"><span className="whitespace-pre-wrap">{batch.notes}</span></Row>}
          </section>

          {/* Membership. */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-text">Cases</h3>
            {batch.cases.length === 0 ? (
              <p className="text-meta text-text-tertiary">No cases in this batch yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">Cases in this batch</caption>
                  <thead>
                    <tr className="border-b border-lightgray">
                      <Th density="cozy">Case</Th>
                      <Th density="cozy">Disposition</Th>
                      <Th density="cozy">Screened</Th>
                      {canChange && (isScreening || isDraft) && <Th density="cozy"><span className="sr-only">Actions</span></Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {batch.cases.map((c) => (
                      <tr key={c.id} className="border-b border-lightgray last:border-b-0">
                        <Td density="cozy" nowrap>
                          <Link href={`/records/${c.recordId}`} className="font-mono text-sm text-primary hover:underline" title={c.recordId}>
                            {c.recordId.slice(0, 8)}
                          </Link>
                        </Td>
                        <Td density="cozy" nowrap>
                          <Badge tone={DISPOSITION_TONE[c.disposition]} size="sm">{DISPOSITION_LABEL[c.disposition]}</Badge>
                        </Td>
                        <Td density="cozy" nowrap><span className="tabular-nums text-sm text-text-secondary">{fmtDateTime(c.screenedAt)}</span></Td>
                        {canChange && (isScreening || isDraft) && (
                          <Td density="cozy" nowrap>
                            {isScreening && (
                              <label className="inline-flex items-center gap-1.5">
                                <span className="sr-only">Disposition for case {c.recordId.slice(0, 8)}</span>
                                <select
                                  aria-label={`Set disposition for case ${c.recordId.slice(0, 8)}`}
                                  className={fieldClass({ inputSize: 'sm' })}
                                  value=""
                                  disabled={setDisposition.isPending}
                                  onChange={(e) => {
                                    const v = e.target.value as RecordableDisposition;
                                    if (v) setDisposition.mutate({ caseId: c.id, disposition: v });
                                  }}
                                >
                                  <option value="" disabled>Record…</option>
                                  {RECORDABLE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              </label>
                            )}
                            {isDraft && (
                              <Button variant="ghost" size="sm" disabled={removeCase.isPending} onClick={() => removeCase.mutate(c.id)}>
                                Remove
                              </Button>
                            )}
                          </Td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isScreening && canChange && (
              <p className="mt-2 text-meta text-text-tertiary">
                Record a disposition per case. <span className="font-medium">QC Selected</span> means selected for QC only — not that QC was performed.
              </p>
            )}
          </section>

          {/* Add case — Draft only. */}
          {canChange && isDraft && (
            <section className="rounded-xl border border-lightgray p-4">
              <h3 className="text-sm font-semibold text-text">Add a case</h3>
              <p className="mt-0.5 text-meta text-text-tertiary">A case may belong to only one active batch. Membership is frozen once the batch is Ready.</p>
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor="sb-add-record" className="mb-1 block text-xs font-medium text-text-secondary">Lab number</label>
                  <input
                    id="sb-add-record"
                    list="sb-record-list"
                    value={recordRef}
                    onChange={(e) => setRecordRef(e.target.value)}
                    placeholder="Lab number"
                    autoComplete="off"
                    className={fieldClass()}
                  />
                  <datalist id="sb-record-list">
                    {records.map((r) => <option key={r.id} value={(r.labNumber ?? r.identifier) ?? ''} />)}
                  </datalist>
                  {recordRef.trim() && !resolvedRecordId && (
                    <p className="mt-1 text-meta text-danger">No accessible record matches that lab number.</p>
                  )}
                </div>
                <Button variant="secondary" disabled={!resolvedRecordId || addCase.isPending} onClick={() => addCase.mutate()}>
                  {addCase.isPending ? 'Adding…' : 'Add'}
                </Button>
              </div>
            </section>
          )}

          {/* Assignment — before screening starts. */}
          {canChange && canAssign && (
            <section className="rounded-xl border border-lightgray p-4">
              <h3 className="text-sm font-semibold text-text">Assign screener</h3>
              <p className="mt-0.5 text-meta text-text-tertiary">
                Enter the screener’s user identifier. This is a screening-batch assignment only — it does not change case or pathologist assignment.
              </p>
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor="sb-assignee" className="mb-1 block text-xs font-medium text-text-secondary">Screener user ID</label>
                  <input
                    id="sb-assignee"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    placeholder={batch.assignedToId ?? 'User identifier'}
                    autoComplete="off"
                    maxLength={64}
                    className={fieldClass()}
                  />
                </div>
                <Button variant="secondary" disabled={!assignee.trim() || assign.isPending} onClick={() => assign.mutate()}>
                  {assign.isPending ? 'Saving…' : batch.assignedToId ? 'Reassign' : 'Assign'}
                </Button>
              </div>
              {status === 'Ready' && !batch.assignedToId && (
                <p className="mt-2 text-meta text-text-tertiary">Assign a screener before marking the batch Assigned.</p>
              )}
            </section>
          )}

          {/* Completion eligibility explanation (explanatory only; API is authoritative). */}
          {canChange && isScreening && completeBlocked && (
            <p className="text-meta text-text-tertiary">
              {batch.caseCount === 0
                ? 'This batch has no cases, so it cannot be completed.'
                : `${batch.pendingCount} case${batch.pendingCount === 1 ? '' : 's'} still need a disposition before the batch can be completed.`}
            </p>
          )}

          {/* Truthful state notes. */}
          {(batch.status === 'Completed' || batch.status === 'Closed') && (
            <p className="text-meta text-text-tertiary">
              {batch.status === 'Completed'
                ? 'Every case has a recorded screening disposition. This does not mean any case is diagnosed, QC-passed, authorized, or released.'
                : 'This batch is closed. Closing records only that the screening workflow is finished.'}
            </p>
          )}
          {batch.status === 'Cancelled' && (
            <p className="text-meta text-text-tertiary">This batch was cancelled; no further actions are available.</p>
          )}
          {!canChange && (
            <p className="text-meta text-text-tertiary">You have view-only access; managing this batch requires the record change permission.</p>
          )}

          {/* Cancel confirmation. */}
          {confirmingCancel && (
            <div className="rounded-xl border border-lightgray p-4">
              <p className="text-sm font-semibold text-text">Cancel this batch?</p>
              <p className="mt-1 text-meta text-text-tertiary">This records the batch as Cancelled. It cannot be reopened.</p>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setConfirmingCancel(false)}>Keep batch</Button>
                <Button variant="danger" size="sm" disabled={transition.isPending} onClick={() => transition.mutate('Cancelled')}>
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
