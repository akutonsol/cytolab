'use client';

import { ShieldAlert } from 'lucide-react';

/**
 * Program 2 · P2-8D — persistent notice shown whenever the PHI view is active. Politely announced to
 * screen readers. Indigo `primary` tokens (never orange). It restates that PHI reads are audited.
 */
export function PhiActiveNotice() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft px-3 py-2 text-sm text-primary"
    >
      <ShieldAlert size={15} aria-hidden />
      <span>
        <strong className="font-semibold">PHI view active.</strong> Patient references are visible — every PHI read is recorded in the audit log.
      </span>
    </div>
  );
}
