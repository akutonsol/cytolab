'use client';

import { ShieldAlert } from 'lucide-react';
import { Modal, Button } from '@/components/ui';

/**
 * Program 2 · P2-9B — the distinct PHI-export confirmation. Reached ONLY by explicitly choosing the PHI
 * projection in the export dialog and pressing Continue; it never inherits the list-view PHI toggle or
 * any remembered consent. The confirm button IS the explicit act (no pre-checked box). Cancel returns
 * to the export dialog; Escape/focus-trap/focus-restore come from the shared Modal (disabled while a
 * request is in flight to keep the dialog stable). A failure produces no file; there is no auto-retry.
 */
export function AuditExportPhiConfirm({
  open,
  onOpenChange,
  formatLabel,
  exporting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formatLabel: string;
  exporting: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Export patient references (PHI)"
      description="This is a separate, explicit action from viewing PHI in the list."
      closeOnEscape={!exporting}
      closeOnBackdrop={!exporting}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={exporting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<ShieldAlert size={15} />}
            loading={exporting}
            loadingLabel="Preparing…"
            onClick={onConfirm}
          >
            Export PHI ({formatLabel})
          </Button>
        </>
      }
    >
      <ul className="space-y-2 text-sm text-slate-600">
        <li>This export may contain <span className="font-medium text-slate-900">patient references</span>.</li>
        <li>Exporting PHI is <span className="font-medium text-slate-900">recorded in the audit log</span> under your identity.</li>
        <li>Handle the downloaded file securely and remove it when it is no longer needed.</li>
        <li>If preparation fails, <span className="font-medium text-slate-900">no file is produced</span>.</li>
      </ul>
    </Modal>
  );
}
