'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui';
import { AuditFilterState } from '@/lib/audit/audit-filters';
import { AuditExportDialog } from './AuditExportDialog';

/**
 * Program 2 · P2-9B — the single list-page Export entry point. Opens the governed export dialog; it
 * does not touch the URL predicate, the cursor, or the active list projection. While an export is in
 * flight the dialog is open and modal (and refuses to close), so the button is shielded from a second
 * concurrent export. Focus returns here on close (shared Modal focus-restore).
 */
export function AuditExportButton({
  state,
  canPhi,
  canSystem,
}: {
  state: AuditFilterState;
  canPhi: boolean;
  canSystem: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={<Download size={15} />}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        Export
      </Button>
      <AuditExportDialog open={open} onOpenChange={setOpen} state={state} canPhi={canPhi} canSystem={canSystem} />
    </>
  );
}
