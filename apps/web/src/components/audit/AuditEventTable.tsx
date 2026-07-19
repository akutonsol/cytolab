'use client';

import { memo } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Th, Td, cn } from '@/components/ui';
import type { AuditEventView } from '@/lib/audit/audit-types';
import { CategoryBadge, SeverityBadge, OutcomeBadge } from './AuditBadge';

/** Absolute time (tabular) + a title with the full timestamp; deterministic, locale-stable enough. */
function fmtTime(iso: string): { label: string; title: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { label: iso, title: iso };
  return {
    label: d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    title: d.toISOString(),
  };
}
const scopeLabel = (e: AuditEventView) =>
  e.organization.scope === 'LAB' ? `LAB · ${e.organization.labId ?? '—'}` : e.organization.scope;
const resourceLabel = (e: AuditEventView) => (e.resource.id ? `${e.resource.type}:${e.resource.id}` : e.resource.type);

const COLUMNS = ['Recorded', 'Category', 'Action', 'Actor', 'Scope', 'Outcome', 'Resource', 'PHI', 'Correlation'];

export function AuditEventTable({ events }: { events: AuditEventView[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left">
              {COLUMNS.map((c) => (
                <Th key={c} density="snug" className="text-xs">{c}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e) => <AuditRow key={e.id} e={e} />)}
          </tbody>
        </table>
      </div>
      {/* Mobile card list — same data, one card per event; no horizontal body scroll. */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {events.map((e) => <AuditCard key={e.id} e={e} />)}
      </ul>
    </div>
  );
}

const AuditRow = memo(function AuditRow({ e }: { e: AuditEventView }) {
  const t = fmtTime(e.recordedAt);
  return (
    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
      <Td density="snug" nowrap><span className="tabular-nums text-slate-600" title={t.title}>{t.label}</span></Td>
      <Td density="snug"><CategoryBadge value={e.category} /></Td>
      <Td density="snug"><span className="font-medium text-slate-800">{e.actionCode}</span></Td>
      <Td density="snug"><span className="text-slate-600">{e.actor.type}{e.actor.id ? ` · ${e.actor.id}` : ''}</span></Td>
      <Td density="snug"><span className="text-slate-600">{scopeLabel(e)}</span></Td>
      <Td density="snug"><OutcomeBadge value={e.outcome} /></Td>
      <Td density="snug"><span className="text-slate-600">{resourceLabel(e)}</span></Td>
      <Td density="snug">{e.phiIndicator ? <ShieldAlert size={15} className="text-primary" aria-label="PHI-bearing event" /> : <span className="text-slate-300" aria-hidden>—</span>}</Td>
      <Td density="snug"><CorrChip value={e.correlationId} /></Td>
    </tr>
  );
});

const AuditCard = memo(function AuditCard({ e }: { e: AuditEventView }) {
  const t = fmtTime(e.recordedAt);
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <CategoryBadge value={e.category} />
        <OutcomeBadge value={e.outcome} />
        {e.phiIndicator && <ShieldAlert size={14} className="text-primary" aria-label="PHI-bearing event" />}
        <span className="ml-auto tabular-nums text-xs text-slate-500" title={t.title}>{t.label}</span>
      </div>
      <div className="text-sm font-medium text-slate-800">{e.actionCode}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>Actor: <span className="text-slate-700">{e.actor.type}{e.actor.id ? ` · ${e.actor.id}` : ''}</span></span>
        <span>Scope: <span className="text-slate-700">{scopeLabel(e)}</span></span>
        <span>Resource: <span className="text-slate-700">{resourceLabel(e)}</span></span>
        <span>Corr: <span className="text-slate-700">{e.correlationId ?? '—'}</span></span>
      </div>
    </li>
  );
});

function CorrChip({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-300" aria-hidden>—</span>;
  const short = value.length > 10 ? `${value.slice(0, 8)}…` : value;
  return <span className={cn('rounded bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-500')} title={value}>{short}</span>;
}
