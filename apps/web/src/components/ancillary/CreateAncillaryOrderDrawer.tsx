'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { Button, Drawer, Field, Input, fieldClass } from '@/components/ui';
import { errorMessage, notify } from '@/lib/notify';

// Create fields are exactly the B3 DTO allowlist: recordId, kind, target,
// blocksSignOut, notes. The server owns id/labId/orderedById/status/timestamps
// and re-checks Record accessibility — client validation is convenience only.
type AncillaryKind = 'IHC' | 'SpecialStain' | 'Molecular' | 'Cytochemistry' | 'Other';
const KIND_OPTIONS: { value: AncillaryKind; label: string }[] = [
  { value: 'IHC', label: 'IHC' },
  { value: 'SpecialStain', label: 'Special stain' },
  { value: 'Molecular', label: 'Molecular' },
  { value: 'Cytochemistry', label: 'Cytochemistry' },
  { value: 'Other', label: 'Other' },
];

export function CreateAncillaryOrderDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [recordRef, setRecordRef] = useState('');
  const [kind, setKind] = useState<AncillaryKind>('IHC');
  const [target, setTarget] = useState('');
  const [blocksSignOut, setBlocksSignOut] = useState(true);
  const [notes, setNotes] = useState('');

  // Owner-backed Record selector (record:view) — the same read the reagents
  // workspace uses. Resolves a typed lab number to its recordId; a cross-lab or
  // unknown value simply does not resolve (and the server re-checks anyway).
  const { data: recPage } = useQuery<Paginated<{ id: string; labNumber?: string | null; identifier?: string | null }>>({
    queryKey: ['ancillary-record-select'],
    queryFn: () => api.get('/specimens', { params: { pageSize: 300 } }).then((r) => r.data),
    enabled: open,
  });
  const records = recPage?.data ?? [];
  const recordId = records.find((r) => (r.labNumber ?? r.identifier) === recordRef.trim())?.id ?? null;

  const reset = () => {
    setRecordRef(''); setKind('IHC'); setTarget(''); setBlocksSignOut(true); setNotes('');
  };
  const close = () => { reset(); onClose(); };

  const create = useMutation({
    mutationFn: () =>
      api.post('/ancillary-orders', {
        recordId,
        kind,
        target: target.trim(),
        blocksSignOut,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      notify.success('Ancillary order placed');
      qc.invalidateQueries({ queryKey: ['ancillary-queue'] });
      close();
    },
    onError: (e) => notify.error(errorMessage(e, 'Could not place the order')),
  });

  const valid = !!recordId && target.trim().length > 0;

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) close(); }}
      title="New ancillary order"
      description="Record an ancillary or IHC work order against a case. The order starts as Ordered."
      width="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Placing…' : 'Place order'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Record" htmlFor="ao-record" required description="Select the case by its lab number.">
          <Input
            id="ao-record"
            list="ao-record-list"
            value={recordRef}
            onChange={(e) => setRecordRef(e.target.value)}
            placeholder="Lab number"
            autoComplete="off"
          />
          <datalist id="ao-record-list">
            {records.map((r) => (
              <option key={r.id} value={(r.labNumber ?? r.identifier) ?? ''} />
            ))}
          </datalist>
          {recordRef.trim() && !recordId && (
            <p className="mt-1 text-meta text-danger">No accessible record matches that lab number.</p>
          )}
        </Field>

        <Field label="Kind" htmlFor="ao-kind" required>
          <select
            id="ao-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AncillaryKind)}
            className={fieldClass()}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Target" htmlFor="ao-target" required description="Marker, antibody, or stain name.">
          <Input id="ao-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. CK7" maxLength={200} />
        </Field>

        <Field label="Notes" htmlFor="ao-notes" description="Optional handling note — not a clinical result.">
          <textarea
            id="ao-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            className={fieldClass()}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={blocksSignOut}
            onChange={(e) => setBlocksSignOut(e.target.checked)}
            className="h-4 w-4"
          />
          Blocks Sign-Out
        </label>
        <p className="text-meta text-text-tertiary">
          While the order is Ordered or In Process and marked to block sign-out, it prevents authorization of the case’s result sheet.
        </p>
      </div>
    </Drawer>
  );
}
