'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Drawer, Field, fieldClass } from '@/components/ui';
import { errorMessage, notify } from '@/lib/notify';
import type { ScreeningBatch } from './types';

// Create fields are exactly the C3 DTO allowlist: notes (optional). The server
// owns id/labId/status/createdById/batchNumber and every timestamp — a new batch
// always starts Draft with an owner-generated number. Nothing else is accepted.
export function CreateScreeningBatchDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (batch: ScreeningBatch) => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');

  const close = () => { setNotes(''); onClose(); };

  const create = useMutation({
    mutationFn: () =>
      api.post<ScreeningBatch>('/screening-batches', { notes: notes.trim() || undefined }).then((r) => r.data),
    onSuccess: (batch) => {
      notify.success(`Screening batch ${batch.batchNumber} created`);
      qc.invalidateQueries({ queryKey: ['screening-batches'] });
      qc.invalidateQueries({ queryKey: ['screening-summary'] });
      setNotes('');
      onCreated?.(batch);
      onClose();
    },
    onError: (e) => notify.error(errorMessage(e, 'Could not create the batch')),
  });

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) close(); }}
      title="New screening batch"
      description="Create a Draft batch, then add cases before marking it Ready. The batch number is assigned automatically."
      width="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create batch'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Notes" htmlFor="sb-notes" description="Optional batch note — workflow only, never a clinical result.">
          <textarea
            id="sb-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            className={fieldClass()}
            placeholder="e.g. Morning gyn cytology run"
          />
        </Field>
        <p className="text-meta text-text-tertiary">
          The batch starts as <span className="font-medium text-text-secondary">Draft</span>. Add cases while it is Draft;
          membership is frozen once it is marked Ready.
        </p>
      </div>
    </Drawer>
  );
}
