'use client';

// Diagnostic Case Workspace — A1: the inert, data-free shell for the record-centric
// diagnostic workspace. It establishes the route, the record:view entry gate, the FROZEN
// nine-band clinical hierarchy (in order), truthful "Not yet loaded" placeholders, the
// validated returnTo grammar, and the one-shot focus pattern. It contains ZERO aggregate
// wiring and ZERO diagnostic data fetching: no api call, no useQuery, no owner-service call,
// no owner-workflow action, no counters/KPIs, no diagnosis, no AI output. The aggregate
// (GET /diagnostic-case/:recordId/overview) and owner composition arrive in A2+. Workflow
// shortcuts + navigation entry arrive in A13. Sign-Out is not touched.
// Contract: docs/PATHOS_DIAGNOSTIC_CASE_IMPLEMENTATION_PLAN.md (A1; §2 frozen architecture,
// §4 frozen order, §6 permission model, §7 five-state contract).

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Badge, Card, EmptyState } from '@/components/ui';

// Only an internal, same-origin path may be a return target — reject external and
// protocol-relative URLs (open-redirect protection). Identical grammar to the Sign-Out /
// Quality / Enterprise Administration guard. Fallback is /records.
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

// The nine approved clinical bands, in the EXACT frozen order (plan §4). `title` is the h2;
// `purpose` is a case-neutral description of what the band WILL compose in a later checkpoint
// — never a value, count, status, diagnosis, or AI result. Order must never change.
const BANDS: { title: string; purpose: string }[] = [
  { title: 'Case Identity', purpose: 'The record’s identity, patient, lifecycle state, clinical indication, and assignment.' },
  { title: 'Diagnostic Material', purpose: 'Specimens, slide metadata, and attachments — the material under review. Images are opened on their viewer.' },
  { title: 'Diagnostic Interpretation', purpose: 'Structured (Bethesda) findings, result-sheet state, and coding — each shown as its owner records it, never merged into a single diagnosis.' },
  { title: 'Decision Support', purpose: 'Assistive material that supports, never replaces, interpretation. Any screening signal is labeled and non-diagnostic.' },
  { title: 'Prior Evidence', purpose: 'The patient’s prior cases, cyto-histo correlation, and historical reports — clearly distinct from the current case.' },
  { title: 'Collaboration', purpose: 'External consultation and escalation activity recorded for this case.' },
  { title: 'Reporting & Sign-Out', purpose: 'Result-sheet authorization state and the released report — opened and acted on in their owner systems.' },
  { title: 'Timeline & Provenance', purpose: 'Recorded status and authorization events for this case, source-labeled and non-canonical.' },
  { title: 'Permissions & Actions', purpose: 'Which sections the current user may view and which owner actions are available.' },
];

export default function DiagnosticCaseWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, hydrated } = useAuth();
  const returnTo = safeReturnTo(searchParams.get('returnTo')) ?? '/records';
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedOnce = useRef(false);

  // Move focus to the workspace heading once on direct entry (accessibility). A one-shot ref
  // guards it so future data refreshes (A2+) can never steal focus. Established now, before any
  // aggregate exists, so the pattern is frozen.
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

  // Entry gate only (the aggregate base gate, plan §6). Owner endpoints remain the enforcement
  // authority for each band once they hydrate in later checkpoints. A caller without record:view
  // sees a truthful No-access state — never clinical placeholders rendered as if data were empty.
  if (!can('record:view')) {
    return (
      <div className="w-full">
        {backToWorklist}
        <Card radius="md" elevation="soft" border="hairline" padding="none">
          <EmptyState bare className="px-6 py-12" title="No access to the Diagnostic Case workspace" description="You do not have permission to view records." />
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
          id="diagnostic-case-heading"
          className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Diagnostic Case
        </h1>
        <p className="mt-1 text-sm text-secondary">
          A record-centric workspace for reviewing diagnostic evidence and invoking the systems that own
          interpretation, collaboration, reporting, and sign-out. It composes the existing owner systems
          and changes nothing itself.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {BANDS.map((b) => (
          <BandShell key={b.title} title={b.title} purpose={b.purpose} />
        ))}
      </div>
    </div>
  );
}

// One clinical band in the A1 shell. Data-free: always the truthful `deferred` state, shown as a
// neutral "Not yet loaded" badge + the band's case-neutral purpose. No data, no counts, no status,
// no owner-workflow buttons, no mock/sample content, no diagnosis, no AI output. The five-state
// contract (ready/empty/forbidden/error/deferred) arrives with the aggregate in A2+.
function BandShell({ title, purpose }: { title: string; purpose: string }) {
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">Not yet loaded</Badge>
      </div>
      <EmptyState bare className="px-0 py-8" title="Not yet loaded" description={purpose} />
    </Card>
  );
}
