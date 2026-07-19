'use client';

import { useState, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/components/ui';
import type { AuditEventView } from '@/lib/audit/audit-types';
import { CategoryBadge, SeverityBadge, OutcomeBadge } from './AuditBadge';
import { MetadataViewer } from './MetadataViewer';

/**
 * Program 2 · P2-8C — the read-only detail envelope, exactly the frozen P2-8A section structure.
 * Accessible label/value via <dl>; no interactive table semantics. Only AuditEventView fields are
 * shown. patientRef is never displayed here (P2-8D owns PHI rendering).
 */
function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
const dash = (v: string | null | undefined) => (v == null || v === '' ? '—' : v);

export function AuditEventCard({ event }: { event: AuditEventView }) {
  return (
    <div className="flex flex-col gap-4">
      <Section title="Identity & time">
        <Row label="Event id"><Copyable value={event.id} /></Row>
        <Row label="Occurred at">{fmt(event.occurredAt)}</Row>
        <Row label="Recorded at">{fmt(event.recordedAt)}</Row>
        <Row label="Schema version">{event.schemaVersion}</Row>
        <Row label="Event version">{event.eventVersion}</Row>
      </Section>

      <Section title="Classification">
        <Row label="Category"><CategoryBadge value={event.category} /></Row>
        <Row label="Action"><span className="font-medium text-slate-800">{event.actionCode}</span></Row>
        <Row label="Severity"><SeverityBadge value={event.severity} /></Row>
        <Row label="Data class">{event.dataClass}</Row>
        <Row label="PHI-bearing">{event.phiIndicator ? 'Yes' : 'No'}</Row>
        <Row label="Outcome"><OutcomeBadge value={event.outcome} /></Row>
      </Section>

      <Section title="Actor & authority">
        <Row label="Actor type">{event.actor.type}</Row>
        <Row label="Actor id">{dash(event.actor.id)}</Row>
        <Row label="Organization scope">{event.organization.scope}</Row>
        <Row label="Lab id">{dash(event.organization.labId)}</Row>
        <Row label="Organization id">{dash(event.organization.organizationId)}</Row>
      </Section>

      <Section title="Resource">
        <Row label="Resource type">{event.resource.type}</Row>
        <Row label="Resource id">{dash(event.resource.id)}</Row>
      </Section>

      <Section title="Context">
        <Row label="Request id">{dash(event.request.requestId)}</Row>
        <Row label="Session id">{dash(event.session.sessionId)}</Row>
        <Row label="Correlation id">{event.correlationId ? <Copyable value={event.correlationId} /> : '—'}</Row>
        <Row label="Producer module">{event.producerModule}</Row>
      </Section>

      <Section title="Metadata">
        <MetadataViewer status={event.metadataStatus} metadata={event.metadata} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white" aria-labelledby={`sec-${title.replace(/\s+/g, '-')}`}>
      <h2 id={`sec-${title.replace(/\s+/g, '-')}`} className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
        {title}
      </h2>
      {/* Metadata section renders its own list; envelope sections use the label/value grid. */}
      {title === 'Metadata' ? children : <dl className="divide-y divide-slate-100">{children}</dl>}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(9rem,14rem)_1fr] items-center gap-3 px-4 py-2.5">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="break-words text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="break-all font-mono text-xs text-slate-700">{value}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : `Copy ${value}`}
        className={cn('rounded p-1 text-slate-400 transition-colors duration-fast ease-standard hover:text-slate-700')}
      >
        {copied ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
      </button>
    </span>
  );
}
