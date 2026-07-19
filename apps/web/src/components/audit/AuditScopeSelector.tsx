'use client';

import { fieldClass } from '@/components/ui';
import type { AuditFilterState } from '@/lib/audit/audit-filters';

/**
 * Program 2 · P2-8B — governed scope selector. Rendered ONLY for audit:read_system holders (the page
 * gates it). LAB/CROSS_LAB accept explicit lab ids (CSV → the API validates the selection). An
 * ordinary reader never sees this; their scope is pinned to their own lab by the server.
 */
export function AuditScopeSelector({
  scope,
  labIds,
  onScope,
  onLabIds,
}: {
  scope: AuditFilterState['scope'];
  labIds: string[] | undefined;
  onScope: (s: AuditFilterState['scope']) => void;
  onLabIds: (ids: string[] | undefined) => void;
}) {
  const needsLabs = scope === 'LAB' || scope === 'CROSS_LAB';
  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500">Scope</span>
        <select
          className={fieldClass({ inputSize: 'sm' })}
          value={scope ?? ''}
          onChange={(e) => onScope((e.target.value || undefined) as AuditFilterState['scope'])}
          aria-label="Audit query scope"
        >
          <option value="">System (default)</option>
          <option value="SYSTEM">System / cross-lab events</option>
          <option value="LAB">A single lab</option>
          <option value="CROSS_LAB">Multiple labs</option>
        </select>
      </label>
      {needsLabs && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Lab id{scope === 'CROSS_LAB' ? 's (comma-separated)' : ''}</span>
          <input
            className={fieldClass({ inputSize: 'sm' })}
            value={labIds?.join(',') ?? ''}
            onChange={(e) => {
              const ids = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
              onLabIds(ids.length ? ids : undefined);
            }}
            placeholder={scope === 'CROSS_LAB' ? 'lab-a, lab-b' : 'lab-a'}
            aria-label="Selected lab ids"
          />
        </label>
      )}
    </div>
  );
}
