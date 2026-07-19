'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button, fieldClass } from '@/components/ui';
import { AuditFilterState, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/lib/audit/audit-filters';
import { AUDIT_CATEGORIES, AUDIT_OUTCOMES, AUDIT_ACTOR_TYPES } from '@/lib/audit/audit-types';

/**
 * Program 2 · P2-8B — allow-listed filter bar. Only the frozen P2-7 filters are exposed; there is NO
 * free-text/metadata/patient search and NO client-side filtering. Filters are drafted locally and
 * committed to the URL on Apply (the URL is the source of truth). Multi-value fields (category,
 * actionCode) accept a comma-separated string; the server enforces the ≤25 bound.
 */
const toCsv = (a?: string[]) => a?.join(', ') ?? '';
const fromCsv = (v: string) => {
  const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
};
// datetime-local <-> ISO
const toLocal = (iso?: string) => (iso ? iso.slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : undefined);

export function AuditFilters({ value, onApply }: { value: AuditFilterState; onApply: (next: AuditFilterState) => void }) {
  const [d, setD] = useState<AuditFilterState>(value);
  const set = <K extends keyof AuditFilterState>(k: K, v: AuditFilterState[K]) => setD((p) => ({ ...p, [k]: v }));

  const clear = () => {
    const cleared: AuditFilterState = { pageSize: DEFAULT_PAGE_SIZE, phi: value.phi, scope: value.scope, labIds: value.labIds };
    setD(cleared);
    onApply(cleared);
  };

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3"
      onSubmit={(e) => { e.preventDefault(); onApply(d); }}
    >
      <Field label="From"><input type="datetime-local" className={fieldClass({ inputSize: 'sm' })} value={toLocal(d.timeFrom)} onChange={(e) => set('timeFrom', fromLocal(e.target.value))} /></Field>
      <Field label="To"><input type="datetime-local" className={fieldClass({ inputSize: 'sm' })} value={toLocal(d.timeTo)} onChange={(e) => set('timeTo', fromLocal(e.target.value))} /></Field>
      <Field label="Category">
        <select className={fieldClass({ inputSize: 'sm' })} value={d.category?.[0] ?? ''} onChange={(e) => set('category', e.target.value ? [e.target.value] : undefined)}>
          <option value="">All</option>
          {AUDIT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Action code(s)"><input className={fieldClass({ inputSize: 'sm' })} value={toCsv(d.actionCode)} onChange={(e) => set('actionCode', fromCsv(e.target.value))} placeholder="SETTING_CHANGED" /></Field>
      <Field label="Outcome">
        <select className={fieldClass({ inputSize: 'sm' })} value={d.outcome ?? ''} onChange={(e) => set('outcome', e.target.value || undefined)}>
          <option value="">All</option>
          {AUDIT_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
      <Field label="Actor type">
        <select className={fieldClass({ inputSize: 'sm' })} value={d.actorType ?? ''} onChange={(e) => set('actorType', e.target.value || undefined)}>
          <option value="">All</option>
          {AUDIT_ACTOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Actor id"><input className={fieldClass({ inputSize: 'sm' })} value={d.actorId ?? ''} onChange={(e) => set('actorId', e.target.value || undefined)} /></Field>
      <Field label="Resource type"><input className={fieldClass({ inputSize: 'sm' })} value={d.resourceType ?? ''} onChange={(e) => set('resourceType', e.target.value || undefined)} placeholder="User" /></Field>
      <Field label="Resource id"><input className={fieldClass({ inputSize: 'sm' })} value={d.resourceId ?? ''} onChange={(e) => set('resourceId', e.target.value || undefined)} /></Field>
      <Field label="Correlation id"><input className={fieldClass({ inputSize: 'sm' })} value={d.correlationId ?? ''} onChange={(e) => set('correlationId', e.target.value || undefined)} /></Field>
      <Field label="Page size">
        <select className={fieldClass({ inputSize: 'sm' })} value={d.pageSize} onChange={(e) => set('pageSize', Number(e.target.value))}>
          {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <div className="flex items-center gap-2 pb-0.5">
        <Button type="submit" size="sm" variant="primary" icon={<Search size={15} />}>Apply</Button>
        <Button type="button" size="sm" variant="ghost" icon={<X size={15} />} onClick={clear}>Clear</Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
