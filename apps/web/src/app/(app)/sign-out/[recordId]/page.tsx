'use client';

// Sign-Out Workspace — B1: the read-only orchestration shell and route.
// Owns orchestration only (case identity, the panel scaffold, permission gating,
// return-to-worklist). It hydrates nothing yet — the read-only aggregate and the
// invoked/embedded domain surfaces arrive in later checkpoints (B2+). No domain
// logic, no mock content: each panel states its responsibility, not fabricated data.
// Contract: docs/PATHOS_SIGNOUT_IMPLEMENTATION_PLAN.md (Orchestration Rule, §4/§4a).

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Card, EmptyState } from '@/components/ui';

// The panel scaffold = the workspace's information-architecture responsibilities
// (plan §11). Each will be composed from an existing owner surface in a later
// checkpoint; none is a second implementation.
const PANELS: { key: string; title: string; responsibility: string }[] = [
  { key: 'context', title: 'Patient & clinical context', responsibility: 'The patient and clinical context for this case.' },
  { key: 'slides', title: 'Digital slides & WSI', responsibility: 'Digital slides and the existing whole-slide viewer.' },
  { key: 'evidence', title: 'AI findings, Bethesda & correlation', responsibility: 'Real AI findings and regions, Bethesda, and correlation.' },
  { key: 'priors', title: 'Prior cases & reports', responsibility: 'Prior cases and prior reports for this patient.' },
  { key: 'attachments', title: 'Attachments', responsibility: 'Supporting documents for this case.' },
  { key: 'report', title: 'Result sheet & report', responsibility: 'The result sheet and report, edited in the existing editor.' },
  { key: 'timeline', title: 'Case timeline', responsibility: 'A unified timeline assembled from recorded events.' },
];

export default function SignOutWorkspacePage() {
  const { recordId } = useParams<{ recordId: string }>();
  const { can, hydrated } = useAuth();

  // Wait for claims so the permission gate does not flash.
  if (!hydrated) return null;

  const backToWorklist = (
    <Link
      href="/records"
      className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary"
    >
      <ArrowLeft size={15} /> Worklist
    </Link>
  );

  // Permission-aware: the workspace mirrors the owning endpoint's gate. Enforcement
  // still lives on the endpoints (defense in depth); this only hides the surface.
  if (!can('record:view')) {
    return (
      <div className="w-full">
        {backToWorklist}
        <Card radius="md" elevation="soft" border="hairline" padding="none">
          <EmptyState
            bare
            className="px-6 py-12"
            title="No access to this case"
            description="You do not have permission to view records."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        {backToWorklist}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">
            Sign-Out
          </h1>
          <span className="font-mono text-sm text-text-secondary">Case {recordId}</span>
        </div>
        <p className="mt-1 text-sm text-secondary">
          One workspace for reading, evidence, priors, reporting, and sign-out — composed from the
          existing PathOS surfaces around this case.
        </p>
      </div>

      {/* Shell scaffold — panels declare their responsibility; case data hydrates in a
          later checkpoint. Nothing here is fabricated. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {PANELS.map((p) => (
          <Card key={p.key} radius="md" elevation="soft" border="hairline" padding="lg">
            <h2 className="text-base font-bold text-text">{p.title}</h2>
            <EmptyState bare className="px-0 py-8" title="Not yet loaded" description={p.responsibility} />
          </Card>
        ))}
      </div>
    </div>
  );
}
