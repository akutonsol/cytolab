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
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui';
import type { CorrelationCaseRow, EffectiveQualityPermissions, EscalationRow, OverviewSource, ProficiencyTestRow, QcAlertRow, QcCheckRow, QualityOverviewAggregate, RecallRow, SectionStatus } from './types';

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
  | 'benchmarks' | 'medicalDirector' | 'governance';

const EVIDENCE_REGIONS: { key: EvidenceKey; title: string; responsibility: string }[] = [
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
          {/* Overview — a factual composition of owner-recorded open counts/statuses.
              No score, no ranking, no inference; each source is owner-provided. */}
          <OverviewPanel section={data?.overview} loading={isLoading} />

          {/* Permissions — the descriptive, permission-aware view (not quality evidence). */}
          <PermissionsPanel section={permsSec} loading={isLoading} />

          {/* Correlation & Discordance — recorded CorrelationCase evidence; review happens
              on the existing correlation owner surface (this never edits or re-reviews). */}
          <CorrelationPanel
            correlation={data?.correlation}
            discordance={data?.discordance}
            loading={isLoading}
            onOpen={(path) => router.push(path)}
          />

          {/* Quality Control — recorded QC evidence; corrective/failure text shown as
              recorded notes only. Resolution happens on the existing QC owner surface. */}
          <QcPanel section={data?.qc} loading={isLoading} onOpen={() => router.push('/qc')} />

          {/* Proficiency — recorded test evidence; grading/administration happen on the
              existing proficiency owner surface. No competency, ranking, or remediation. */}
          <ProficiencyPanel section={data?.proficiency} loading={isLoading} onOpen={(path) => router.push(path)} />

          {/* Escalations & Recall — recorded lifecycle evidence; review/completion happen on
              the existing owner surfaces. No urgency score, no computed overdue. */}
          <EscalationPanel section={data?.escalations} loading={isLoading} onOpen={() => router.push('/escalations')} />
          <RecallPanel section={data?.recall} loading={isLoading} onOpen={() => router.push('/recalls')} />

          {/* The remaining evidence regions — truthfully deferred; each reflects its own
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

// Overview — a restrained factual summary. For each owner source it shows the owner's
// recorded open count and a factual note, "No recorded open items" when the owner's count
// is zero, or "Source unavailable" when forbidden/errored. No score, chart, ranking,
// health/risk meter, synthetic global state, colour-only meaning, or CAPA language.
function OverviewPanel({
  section,
  loading,
}: {
  section?: QualityOverviewAggregate['overview'];
  loading: boolean;
}) {
  const status = section?.status;
  const data = status === 'ready' ? section?.data : null;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <h2 className="mb-3 text-base font-bold text-text">Overview</h2>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status !== 'ready' || !data ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="The overview could not be loaded." />
      ) : (
        <div className="space-y-2">
          {data.sources.map((s) => <OverviewRow key={s.key} source={s} />)}
          {data.unavailable.length > 0 && (
            <p className="pt-1 text-meta text-text-tertiary">Sources unavailable: {data.unavailable.join(', ')}.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function OverviewRow({ source }: { source: OverviewSource }) {
  const unavailable = source.status !== 'ready';
  const noOpen = source.status === 'ready' && (source.open ?? 0) === 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lightgray px-3 py-2">
      <div className="min-w-0">
        <span className="text-sm font-semibold text-text">{source.label}</span>
        <span className="ml-2 text-meta text-text-tertiary">
          {unavailable ? 'Source unavailable' : noOpen ? 'No recorded open items' : source.note}
        </span>
      </div>
      {!unavailable && (
        <Badge tone="neutral" size="xs">{source.open} open</Badge>
      )}
    </div>
  );
}

const fmtDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString() : '—');
// Owner-stored correlation-result label + tone (no synthetic severity; tones avoid amber).
const resultTone = (r: string | null): 'success' | 'danger' | 'neutral' =>
  r === 'Concordant' ? 'success' : r === 'MajorDiscordant' ? 'danger' : 'neutral';
const resultLabel = (r: string | null): string =>
  r === 'MinorDiscordant' ? 'Minor discordant' : r === 'MajorDiscordant' ? 'Major discordant' : r || 'Unresolved';

// Correlation & Discordance. Owner-computed counts are shown verbatim; the discordance list
// contains only cases whose STORED result records discordance. Review opens the existing
// correlation surface — no second editor, no re-review, no concordance score, no ranking.
function CorrelationPanel({
  correlation,
  discordance,
  loading,
  onOpen,
}: {
  correlation?: QualityOverviewAggregate['correlation'];
  discordance?: QualityOverviewAggregate['discordance'];
  loading: boolean;
  onOpen: (ownerPath: string) => void;
}) {
  const status = correlation?.status;
  const c = status === 'ready' ? correlation?.data : null;
  const d = discordance?.status === 'ready' ? discordance?.data : null;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <h2 className="mb-3 text-base font-bold text-text">Correlation &amp; Discordance</h2>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-6" title="No access" description="You do not have permission to view correlation." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="Correlation could not be loaded." />
      ) : status === 'empty' || !c ? (
        <EmptyState bare className="px-0 py-6" title="No correlation cases" description="No cytology–histology correlation cases are recorded." />
      ) : (
        <div className="space-y-4">
          {/* Owner-recorded counts (verbatim). Review-required is owner workflow state. */}
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral" size="sm">{c.total} total</Badge>
            <Badge tone="success" size="sm">{c.concordant} concordant</Badge>
            <Badge tone="neutral" size="sm">{c.minorDiscordant} minor discordant</Badge>
            <Badge tone={c.majorDiscordant > 0 ? 'danger' : 'neutral'} size="sm">{c.majorDiscordant} major discordant</Badge>
            <Badge tone="neutral" size="sm">{c.unresolved} unresolved</Badge>
            <Badge tone="neutral" size="sm">{c.pendingReview} awaiting review</Badge>
          </div>
          {/* Discordance list — only stored-discordant cases; review on the owner surface. */}
          <div>
            <div className="mb-2 text-meta font-semibold uppercase tracking-wide text-text-tertiary">
              Discordant cases{d ? ` (${d.count})` : ''}
            </div>
            {d && d.items.length ? (
              <div className="space-y-2">
                {d.items.map((row) => <DiscordanceRow key={row.id} row={row} onOpen={() => onOpen(row.ownerPath)} />)}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">No recorded discordant cases.</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function DiscordanceRow({ row, onOpen }: { row: CorrelationCaseRow; onOpen: () => void }) {
  return (
    <div className="rounded-lg border border-lightgray px-3 py-2.5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-text">{row.identity ?? 'Case'}</span>
          <Badge tone={resultTone(row.correlationResult)} size="xs">{resultLabel(row.correlationResult)}</Badge>
          {row.reviewRequired && !row.reviewedAt && <Badge tone="neutral" size="xs">Review required</Badge>}
        </div>
        <Button variant="secondary" size="sm" onClick={onOpen}>Open correlation</Button>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <div className="text-meta text-text-tertiary">Cytology: <span className="text-text">{row.cytologyDiagnosis || '—'}</span></div>
        <div className="text-meta text-text-tertiary">
          Histology{row.histologySource && row.histologySource !== 'Internal' ? ` (${row.histologySource})` : ''}: <span className="text-text">{row.histologyDiagnosis || '—'}</span>
        </div>
      </div>
      {row.discordanceReason && (
        <p className="mt-1.5 text-sm text-text-secondary"><span className="font-semibold text-text">Reason:</span> {row.discordanceReason}</p>
      )}
      {row.reviewedAt && (
        <p className="mt-1 text-meta text-text-tertiary">Reviewed {row.reviewerName ? `by ${row.reviewerName} ` : ''}· {fmtDate(row.reviewedAt)}</p>
      )}
    </div>
  );
}

// Stored QC result → tone (no synthetic severity; tones avoid amber).
const qcResultTone = (r: string): 'success' | 'danger' | 'neutral' =>
  r === 'Pass' ? 'success' : r === 'Fail' ? 'danger' : 'neutral';

// Quality Control — recorded counts, recent checks, and open alerts. failureReason and
// correctiveAction are shown verbatim as recorded NOTES — never CAPA, root cause, preventive
// action, or effectiveness. No severity, no QC health score. Resolution opens the QC owner
// surface (`/qc`); this never resolves alerts or edits checks itself.
function QcPanel({
  section,
  loading,
  onOpen,
}: {
  section?: QualityOverviewAggregate['qc'];
  loading: boolean;
  onOpen: () => void;
}) {
  const status = section?.status;
  const d = status === 'ready' ? section?.data : null;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-text">Quality Control</h2>
        {d && <Button variant="secondary" size="sm" onClick={onOpen}>Open QC</Button>}
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-6" title="No access" description="You do not have permission to view QC." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="Quality Control could not be loaded." />
      ) : status === 'empty' || !d ? (
        <EmptyState bare className="px-0 py-6" title="No QC data" description="No QC checks or alerts are recorded." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral" size="sm">{d.totalChecks} checks</Badge>
            <Badge tone="success" size="sm">{d.pass} pass</Badge>
            <Badge tone={d.fail > 0 ? 'danger' : 'neutral'} size="sm">{d.fail} fail</Badge>
            <Badge tone="neutral" size="sm">{d.marginal} marginal</Badge>
            <Badge tone={d.openAlerts > 0 ? 'danger' : 'neutral'} size="sm">{d.openAlerts} open alert{d.openAlerts === 1 ? '' : 's'}</Badge>
          </div>

          <div>
            <div className="mb-2 text-meta font-semibold uppercase tracking-wide text-text-tertiary">Open alerts</div>
            {d.alerts.length ? (
              <div className="space-y-2">{d.alerts.map((a) => <QcAlertItem key={a.id} alert={a} />)}</div>
            ) : (
              <p className="text-sm text-text-tertiary">No open failure alerts.</p>
            )}
          </div>

          <div>
            <div className="mb-2 text-meta font-semibold uppercase tracking-wide text-text-tertiary">Recent checks</div>
            {d.recentChecks.length ? (
              <div className="space-y-2">{d.recentChecks.map((c) => <QcCheckItem key={c.id} check={c} />)}</div>
            ) : (
              <p className="text-sm text-text-tertiary">No recorded checks.</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function QcAlertItem({ alert }: { alert: QcAlertRow }) {
  const meta = [alert.relatedCheckType, alert.equipmentName, alert.createdAt ? fmtDate(alert.createdAt) : null].filter(Boolean).join(' · ');
  return (
    <div className="rounded-lg border border-lightgray px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="danger" size="xs">{alert.status}</Badge>
        {meta && <span className="text-meta text-text-tertiary">{meta}</span>}
      </div>
      {alert.failureReason && (
        <p className="mt-1 text-sm text-text-secondary"><span className="font-semibold text-text">Recorded failure reason:</span> {alert.failureReason}</p>
      )}
    </div>
  );
}

function QcCheckItem({ check }: { check: QcCheckRow }) {
  const meta = [check.checkType, check.equipmentName, check.recordIdentity, check.performerName, check.performedAt ? fmtDate(check.performedAt) : null].filter(Boolean).join(' · ');
  return (
    <div className="rounded-lg border border-lightgray px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={qcResultTone(check.result)} size="xs">{check.result}</Badge>
        {meta && <span className="text-meta text-text-tertiary">{meta}</span>}
      </div>
      {check.failureReason && (
        <p className="mt-1 text-sm text-text-secondary"><span className="font-semibold text-text">Recorded failure reason:</span> {check.failureReason}</p>
      )}
      {check.correctiveAction && (
        <p className="mt-1 text-sm text-text-secondary"><span className="font-semibold text-text">Recorded corrective-action note:</span> {check.correctiveAction}</p>
      )}
    </div>
  );
}

// Proficiency — recorded totals, the owner-computed lab average, and recorded tests with
// their recorded status. No competency inference, no staff leaderboard, no remediation, no
// synthetic pass/fail. Grading/administration open the existing proficiency owner surface.
function ProficiencyPanel({
  section,
  loading,
  onOpen,
}: {
  section?: QualityOverviewAggregate['proficiency'];
  loading: boolean;
  onOpen: (ownerPath: string) => void;
}) {
  const status = section?.status;
  const d = status === 'ready' ? section?.data : null;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <h2 className="mb-3 text-base font-bold text-text">Proficiency</h2>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-6" title="No access" description="You do not have permission to view proficiency." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="Proficiency could not be loaded." />
      ) : status === 'empty' || !d ? (
        <EmptyState bare className="px-0 py-6" title="No proficiency tests" description="No proficiency tests are recorded." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral" size="sm">{d.totalTests} tests</Badge>
            <Badge tone="neutral" size="sm">{d.completedTests} completed</Badge>
            {d.averageScore != null && <Badge tone="neutral" size="sm">Lab average {d.averageScore}% (owner-computed)</Badge>}
          </div>
          {d.tests.length ? (
            <div className="space-y-2">{d.tests.map((t) => <ProficiencyRow key={t.id} test={t} onOpen={() => onOpen(t.ownerPath)} />)}</div>
          ) : (
            <p className="text-sm text-text-tertiary">No recorded tests.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function ProficiencyRow({ test, onOpen }: { test: ProficiencyTestRow; onOpen: () => void }) {
  const meta = [
    test.testType,
    test.administeredByName ? `by ${test.administeredByName}` : null,
    test.passingScore != null ? `pass ≥ ${test.passingScore}%` : null,
    `${test.responderCount} responder${test.responderCount === 1 ? '' : 's'}`,
    test.endDate ? fmtDate(test.endDate) : test.createdAt ? fmtDate(test.createdAt) : null,
  ].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-lightgray px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-text">{test.name}</span>
          <Badge tone="neutral" size="xs">{test.status}</Badge>
        </div>
        <div className="mt-0.5 text-meta text-text-tertiary">{meta}</div>
      </div>
      <Button variant="secondary" size="sm" onClick={onOpen}>Open</Button>
    </div>
  );
}

// Escalations — recorded counts + recorded escalations. severity/status shown verbatim;
// resolvedReason labeled as a recorded resolution note. No urgency score, no CAPA. Review
// opens the existing escalation owner surface.
function EscalationPanel({
  section,
  loading,
  onOpen,
}: {
  section?: QualityOverviewAggregate['escalations'];
  loading: boolean;
  onOpen: () => void;
}) {
  const status = section?.status;
  const d = status === 'ready' ? section?.data : null;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-text">Escalations</h2>
        {d && <Button variant="secondary" size="sm" onClick={onOpen}>Open escalations</Button>}
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-6" title="No access" description="You do not have permission to view escalations." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="Escalations could not be loaded." />
      ) : status === 'empty' || !d ? (
        <EmptyState bare className="px-0 py-6" title="No escalations" description="No abnormal-result escalations are recorded." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={d.pending > 0 ? 'danger' : 'neutral'} size="sm">{d.pending} pending</Badge>
            <Badge tone="neutral" size="sm">{d.acknowledged} acknowledged</Badge>
            <Badge tone="neutral" size="sm">{d.underReview} under review</Badge>
            <Badge tone="neutral" size="sm">{d.resolvedToday} resolved today</Badge>
            <Badge tone={d.malignant > 0 ? 'danger' : 'neutral'} size="sm">{d.malignant} malignant</Badge>
            <Badge tone="neutral" size="sm">{d.highGrade} high-grade</Badge>
          </div>
          {d.items.length ? (
            <div className="space-y-2">{d.items.map((e) => <EscalationItem key={e.id} row={e} />)}</div>
          ) : (
            <p className="text-sm text-text-tertiary">No recorded escalation items.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function EscalationItem({ row }: { row: EscalationRow }) {
  const meta = [row.trigger, row.assignedToName ? `assigned ${row.assignedToName}` : null, row.createdAt ? fmtDate(row.createdAt) : null].filter(Boolean).join(' · ');
  return (
    <div className="rounded-lg border border-lightgray px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-text">{row.identity ?? 'Case'}</span>
        {row.severity && <Badge tone="neutral" size="xs">{row.severity}</Badge>}
        <Badge tone="neutral" size="xs">{row.status}</Badge>
      </div>
      {meta && <div className="mt-0.5 text-meta text-text-tertiary">{meta}</div>}
      {row.resolvedAt && (
        <p className="mt-1 text-meta text-text-tertiary">Resolved {fmtDate(row.resolvedAt)}{row.reviewerName ? ` · reviewed by ${row.reviewerName}` : ''}</p>
      )}
      {row.resolvedReason && (
        <p className="mt-1 text-sm text-text-secondary"><span className="font-semibold text-text">Recorded resolution note:</span> {row.resolvedReason}</p>
      )}
    </div>
  );
}

// Recall — recorded counts + recorded items. status (incl. Overdue) is recorded, never
// computed. No compliance verdict. Completion opens the existing recall owner surface.
function RecallPanel({
  section,
  loading,
  onOpen,
}: {
  section?: QualityOverviewAggregate['recall'];
  loading: boolean;
  onOpen: () => void;
}) {
  const status = section?.status;
  const d = status === 'ready' ? section?.data : null;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-text">Recall</h2>
        {d && <Button variant="secondary" size="sm" onClick={onOpen}>Open recalls</Button>}
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-6" title="No access" description="You do not have permission to view recall." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="Recall could not be loaded." />
      ) : status === 'empty' || !d ? (
        <EmptyState bare className="px-0 py-6" title="No recall items" description="No recall or follow-up items are recorded." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={d.overdue > 0 ? 'danger' : 'neutral'} size="sm">{d.overdue} overdue</Badge>
            <Badge tone="neutral" size="sm">{d.due} due</Badge>
            <Badge tone="neutral" size="sm">{d.pending} pending</Badge>
            <Badge tone="neutral" size="sm">{d.completedThisMonth} completed this month</Badge>
          </div>
          {d.items.length ? (
            <div className="space-y-2">{d.items.map((r) => <RecallItem key={r.id} row={r} />)}</div>
          ) : (
            <p className="text-sm text-text-tertiary">No recorded recall items.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function RecallItem({ row }: { row: RecallRow }) {
  const meta = [row.reason, row.dueAt ? `due ${fmtDate(row.dueAt)}` : null, row.completedAt ? `completed ${fmtDate(row.completedAt)}` : null].filter(Boolean).join(' · ');
  return (
    <div className="rounded-lg border border-lightgray px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-text">{row.identity ?? 'Patient'}</span>
        <Badge tone={row.status === 'Overdue' ? 'danger' : 'neutral'} size="xs">{row.status}</Badge>
      </div>
      {meta && <div className="mt-0.5 text-meta text-text-tertiary">{meta}</div>}
      {row.completionNote && (
        <p className="mt-1 text-sm text-text-secondary"><span className="font-semibold text-text">Recorded note:</span> {row.completionNote}</p>
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
