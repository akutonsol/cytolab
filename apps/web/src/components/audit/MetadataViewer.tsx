'use client';

import { Lock, HelpCircle } from 'lucide-react';
import type { AuditEventView } from '@/lib/audit/audit-types';
import { orderedMetadataEntries, formatMetadataValue } from '@/lib/audit/audit-metadata-view';

/**
 * Program 2 · P2-8C — metadata renderer driven EXCLUSIVELY by metadataStatus. No reveal workflow here
 * (that is P2-8D); redacted states render a neutral locked panel. The redaction reason is exposed to
 * screen readers. The event envelope stays visible regardless.
 */
export function MetadataViewer({ status, metadata }: { status: AuditEventView['metadataStatus']; metadata: AuditEventView['metadata'] }) {
  if (status === 'redacted_phi') {
    return (
      <Panel icon={<Lock size={16} />} tone="phi">
        <span>PHI metadata is hidden. Enable the PHI view (requires the PHI permission) to request it — each PHI read is logged.</span>
      </Panel>
    );
  }
  if (status === 'redacted_unknown_version') {
    return (
      <Panel icon={<HelpCircle size={16} />} tone="unknown">
        <span>Metadata is unavailable because this event version isn’t recognized by this console.</span>
      </Panel>
    );
  }
  const entries = orderedMetadataEntries(metadata);
  if (entries.length === 0) {
    return <p className="px-4 py-3 text-sm text-slate-500">No metadata for this event.</p>;
  }
  return (
    <dl className="divide-y divide-slate-100">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[minmax(9rem,14rem)_1fr] gap-3 px-4 py-2.5">
          <dt className="font-mono text-xs text-slate-500">{k}</dt>
          <dd className="break-words font-mono text-xs text-slate-800">{formatMetadataValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Panel({ icon, tone, children }: { icon: React.ReactNode; tone: 'phi' | 'unknown'; children: React.ReactNode }) {
  const cls = tone === 'phi' ? 'border-primary/30 bg-primary-soft text-primary' : 'border-slate-200 bg-slate-50 text-slate-600';
  return (
    <div className={`m-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${cls}`} role="note">
      <span aria-hidden className="mt-0.5">{icon}</span>
      {children}
    </div>
  );
}
