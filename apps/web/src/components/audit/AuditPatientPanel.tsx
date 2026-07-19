'use client';

import { ShieldAlert } from 'lucide-react';
import { CopyValue } from './CopyValue';

/**
 * Program 2 · P2-8D — the PHI patient-reference panel. Rendered ONLY when the PHI projection actually
 * returned a patientRef (never synthesized, never inferred, never shown in base mode). Distinct PHI
 * (indigo `primary`) visual treatment + accessible copy. patientRef is a pseudonymous, opaque token.
 */
export function AuditPatientPanel({ patientRef }: { patientRef: string }) {
  return (
    <section aria-labelledby="phi-patient-ref" className="overflow-hidden rounded-2xl border border-primary/40 bg-primary-soft">
      <h2 id="phi-patient-ref" className="flex items-center gap-2 border-b border-primary/20 px-4 py-3 text-sm font-semibold text-primary">
        <ShieldAlert size={15} aria-hidden /> Patient reference (PHI)
      </h2>
      <dl className="divide-y divide-primary/10">
        <div className="grid grid-cols-[minmax(9rem,14rem)_1fr] items-center gap-3 px-4 py-2.5">
          <dt className="text-xs font-medium text-primary/80">Pseudonymous patient ref</dt>
          <dd><CopyValue value={patientRef} /></dd>
        </div>
      </dl>
    </section>
  );
}
