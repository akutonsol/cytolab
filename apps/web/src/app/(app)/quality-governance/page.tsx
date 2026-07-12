'use client';

// Quality & Governance Workspace — C2: connect the shell to the read-only aggregate.
// Orchestration surface only. It owns navigation, composition, layout, truthful states,
// and permission-aware presentation — NO quality-domain logic. C2 reads a single aggregate
// (GET /quality-governance/overview) that returns the descriptive permission map (ready)
// and the ten evidence sections as `deferred`. No quality evidence, counters, charts,
// scores, or rankings are shown. Each evidence region hydrates in a later checkpoint.
// Contract: docs/PATHOS_QUALITY_IMPLEMENTATION_PLAN.md (§1 Orchestration Rule, §3, §9).

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import type { EffectiveQualityPermissions, QualityOverviewAggregate, SectionStatus } from './types';

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

// The approved information architecture. Each evidence region maps to its aggregate
// section key; the Correlation & Discordance region reflects the `correlation` section
// (the `discordance` section joins it at C4). `permissions` renders the descriptive map.
type EvidenceKey =
  | 'overview' | 'correlation' | 'qc' | 'proficiency' | 'escalations'
  | 'recall' | 'benchmarks' | 'medicalDirector' | 'governance';

const EVIDENCE_REGIONS: { key: EvidenceKey; title: string; responsibility: string }[] = [
  { key: 'overview', title: 'Overview', responsibility: 'Recorded quality-evidence counts, composed from the owner sections below.' },
  { key: 'correlation', title: 'Correlation & Discordance', responsibility: 'Cytology–histology correlation and stored discordance results.' },
  { key: 'qc', title: 'Quality Control', responsibility: 'Analytical QC checks, failure alerts, and recorded corrective notes.' },
  { key: 'proficiency', title: 'Proficiency', responsibility: 'Proficiency testing status and grading.' },
  { key: 'escalations', title: 'Escalations', responsibility: 'Abnormal-result escalations awaiting review or resolution.' },
  { key: 'recall', title: 'Recall', responsibility: 'Patient recall and follow-up compliance.' },
  { key: 'benchmarks', title: 'Benchmarks', responsibility: 'Owner-computed CAP, Bethesda, TAT, and abnormal-rate status.' },
  { key: 'medicalDirector', title: 'Medical Director', responsibility: 'Attention, review, and oversight queues from recorded owner states.' },
  { key: 'governance', title: 'Governance Trail', responsibility: 'A source-labelled assembly of recorded events — not a canonical audit ledger.' },
];

// Descriptive permission map labels (permission-aware presentation; not quality evidence).
const PERMISSION_LABELS: { key: keyof EffectiveQualityPermissions; label: string }[] = [
  { key: 'viewRecord', label: 'View records' },
  { key: 'changeRecord', label: 'Change records' },
  { key: 'viewResultEntry', label: 'View result entries' },
  { key: 'viewResultSheet', label: 'View result sheets' },
  { key: 'authorize', label: 'Authorize / grade' },
  { key: 'viewReport', label: 'View reports' },
  { key: 'viewNotification', label: 'View notifications' },
  { key: 'security', label: 'Security governance' },
  { key: 'viewChangeRequest', label: 'View change requests' },
  { key: 'changeChangeRequest', label: 'Change change requests' },
  { key: 'medicalDirector', label: 'Medical Director oversight' },
];

export default function QualityGovernanceWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, hydrated } = useAuth();
  const returnTo = safeReturnTo(searchParams.get('returnTo')) ?? '/records';
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedOnce = useRef(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['quality-overview'],
    queryFn: () => api.get<QualityOverviewAggregate>('/quality-governance/overview').then((r) => r.data),
    enabled: hydrated && can('record:view'),
  });

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

  // Entry permission gate only (the aggregate base gate, docs §9). Owner endpoints remain
  // the enforcement authority for each section once they hydrate.
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

  const permsSec = data?.permissions;

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

      {isError ? (
        <Card radius="md" elevation="soft" border="hairline" padding="lg" className="text-center">
          <p className="text-sm text-text-secondary">Couldn’t load the workspace.</p>
          <button type="button" onClick={() => refetch()} className="mt-3 text-sm font-semibold text-primary hover:underline">Retry</button>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Permissions — the descriptive, permission-aware view (not quality evidence). */}
          <PermissionsPanel section={permsSec} loading={isLoading} />

          {/* The nine evidence regions — truthfully deferred at C2; each reflects its own
              aggregate section status, so a future failure isolates to its region. */}
          {EVIDENCE_REGIONS.map((r) => (
            <EvidenceRegion
              key={r.key}
              title={r.title}
              responsibility={r.responsibility}
              status={data?.[r.key]?.status}
              loading={isLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// The Permissions region renders the real descriptive map — which owner permissions the
// caller holds. Status by text (badge label), never colour alone.
function PermissionsPanel({
  section,
  loading,
}: {
  section?: QualityOverviewAggregate['permissions'];
  loading: boolean;
}) {
  const status = section?.status;
  const data = status === 'ready' ? section?.data : null;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <h2 className="mb-3 text-base font-bold text-text">Permissions</h2>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'ready' && data ? (
        <div className="flex flex-wrap gap-2">
          {PERMISSION_LABELS.map(({ key, label }) => (
            <Badge key={key} tone={data[key] ? 'success' : 'neutral'} size="sm">
              {data[key] ? '' : 'No '}{label}
            </Badge>
          ))}
        </div>
      ) : (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="The permission map could not be loaded." />
      )}
    </Card>
  );
}

// One evidence region. At C2 every section is `deferred`; the region distinguishes
// loading / deferred / forbidden / error truthfully. No evidence, counters, or metrics.
function EvidenceRegion({
  title,
  responsibility,
  status,
  loading,
}: {
  title: string;
  responsibility: string;
  status?: SectionStatus;
  loading: boolean;
}) {
  const stateBadge =
    status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : 'Not yet loaded';
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        {!loading && status && <Badge tone="neutral" size="xs">{stateBadge}</Badge>}
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view this section." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-8" title="Unavailable" description="This section could not be loaded." />
      ) : (
        // deferred (and, defensively, empty/ready which cannot occur until later checkpoints)
        <EmptyState bare className="px-0 py-8" title="Not yet loaded" description={responsibility} />
      )}
    </Card>
  );
}
