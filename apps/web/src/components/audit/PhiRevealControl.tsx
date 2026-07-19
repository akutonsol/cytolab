'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { PhiToggle } from './PhiToggle';

/**
 * Program 2 · P2-8D — the complete PHI reveal control. Enabling PHI ALWAYS routes through a
 * confirmation dialog (no hidden enable path); disabling is immediate and safe. The dialog states
 * that PHI becomes visible and that access is recorded; Cancel returns without revealing anything.
 * Focus trap / Escape / return-focus come from the Modal primitive. Render only when audit:read_phi.
 */
export function PhiRevealControl({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestToggle = (next: boolean) => {
    if (next) setConfirmOpen(true); // enabling → confirm first
    else onChange(false); // disabling → safe, immediate
  };
  const confirm = () => {
    setConfirmOpen(false);
    onChange(true);
  };

  return (
    <>
      <PhiToggle on={on} onChange={requestToggle} />
      <Modal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reveal PHI"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" icon={<ShieldAlert size={15} />} onClick={confirm}>Reveal PHI</Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-slate-600">
          <p>Enabling the PHI view reveals pseudonymous patient references and PHI-bearing metadata for the events you can access.</p>
          <p className="font-medium text-slate-800">Every PHI read is recorded in the audit log under your identity.</p>
          <p>Do you want to continue?</p>
        </div>
      </Modal>
    </>
  );
}
