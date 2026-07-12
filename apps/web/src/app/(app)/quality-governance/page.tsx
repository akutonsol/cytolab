'use client';

// Quality & Governance Workspace — C1 shell only.
// Orchestration surface: owns navigation, composition, layout, truthful loading states,
// and permission-aware presentation. It owns NO quality-domain logic and, at this
// checkpoint, loads NO data: zero API calls, zero fetch, zero React Query, zero owner
// services, zero mock quality objects. Every section renders a truthful "Not yet loaded"
// placeholder until its checkpoint (C3–C10) hydrates it through the aggregate endpoint.
// Contract: docs/PATHOS_QUALITY_IMPLEMENTATION_PLAN.md (Orchestration Rule §1, checkpoints C1–C13).

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Badge, Card, EmptyState } from '@/components/ui';

// Only an internal, same-origin path may be a return target — reject external and
// protocol-relative URLs (open-redirect protection). Mirrors the Sign-Out routing guard.
function safeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  let p: string;
  try { p = decodeURIComponent(raw); } catch { return null; }
  if (!p.startsWith('/')) return null;
  if (p.startsWith('//')) return null;
  if (/[\\\x00-\x1f]/.test(p)) return null;
  if (/^\/(login|portal\/login)\b/.test(p)) return null;
  return p;
}

// The approved information architecture (docs/PATHOS_QUALITY_WORKSPACE.md §5 /
// PATHOS_QUALITY_IMPLEMENTATION_PLAN.md §3). Sections are placeholders at C1; each lands
// in a later checkpoint. No metrics, no counters — the shell owns layout, not evidence.
const SECTIONS: { key: string; title: string; responsibility: string }[] = [
  { key: 'overview', title: 'Overview', responsibility: 'Recorded quality-evidence counts, composed from the owner sections below.' },
  { key: 'correlation', title: 'Correlation & Discordance', responsibility: 'Cytology–histology correlation and stored discordance results.' },
  { key: 'qc', title: 'Quality Control', responsibility: 'Analytical QC checks, failure alerts, and recorded corrective notes.' },
  { key: 'proficiency', title: 'Proficiency', responsibility: 'Proficiency testing status and grading.' },
  { key: 'escalations', title: 'Escalations', responsibility: 'Abnormal-result escalations awaiting review or resolution.' },
  { key: 'recall', title: 'Recall', responsibility: 'Patient recall and follow-up compliance.' },
  { key: 'benchmarks', title: 'Benchmarks', responsibility: 'Owner-computed CAP, Bethesda, TAT, and abnormal-rate status.' },
  { key: 'medicalDirector', title: 'Medical Director', responsibility: 'Attention, review, and oversight queues from recorded owner states.' },
  { key: 'governance', title: 'Governance Trail', responsibility: 'A source-labelled assembly of recorded events — not a canonical audit ledger.' },
  { key: 'permissions', title: 'Permissions', responsibility: 'The descriptive, permission-aware view of what this user may see and do.' },
];

export default function QualityGovernanceWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, hydrated } = useAuth();
  // Deterministic return: honor a validated internal ?returnTo=, else fall back to the worklist.
  const returnTo = safeReturnTo(searchParams.get('returnTo')) ?? '/records';
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedOnce = useRef(false);

  // Move focus to the workspace heading once on entry (meaningful landing point for
  // keyboard/AT users). One-shot so nothing steals focus later.
  useEffect(() => {
    if (hydrated && !focusedOnce.current && headingRef.current) {
      focusedOnce.current = true;
      headingRef.current.focus({ preventScroll: true });
    }
  }, [hydrated]);

  if (!hydrated) return null;

  const backToWorklist = (
    <button
      type="button"
      onClick={() => router.push(returnTo)}
      className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary"
      title="Return to worklist"
    >
      <ArrowLeft size={15} /> Worklist
    </button>
  );

  // Entry permission gate only (the aggregate base gate, docs §9). No section permissions
  // yet; owner endpoints remain the enforcement authority once sections hydrate.
  if (!can('record:view')) {
    return (
      <div className="w-full">
        {backToWorklist}
        <Card radius="md" elevation="soft" border="hairline" padding="none">
          <EmptyState bare className="px-6 py-12" title="No access to Quality & Governance" description="You do not have permission to view records." />
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        {backToWorklist}
        <h1
          ref={headingRef}
          tabIndex={-1}
          id="quality-heading"
          className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Quality &amp; Governance
        </h1>
        <p className="mt-1 text-sm text-secondary">
          One workspace for diagnostic quality, compliance, corrective evidence, and governance —
          composed from the existing PathOS owner systems. It surfaces recorded evidence only.
        </p>
      </div>

      {/* Orchestration shell — every section is a truthful placeholder until its checkpoint
          hydrates it through the read-only aggregate. No data, no metrics, no mock content. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.key} radius="md" elevation="soft" border="hairline" padding="lg">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-base font-bold text-text">{s.title}</h2>
              <Badge tone="neutral" size="xs">Not yet loaded</Badge>
            </div>
            <EmptyState bare className="px-0 py-8" title="Not yet loaded" description={s.responsibility} />
          </Card>
        ))}
      </div>
    </div>
  );
}
