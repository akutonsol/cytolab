'use client';

// Diagnostic Case Workspace — A2: connect the shell to the FROZEN read-only aggregate
// (GET /diagnostic-case/:recordId/overview). A2 hydrates ONLY the Permissions & Actions band from
// the descriptive permission map (`permissions` → ready); the other eight clinical-content bands
// stay truthfully `deferred` ("Not yet loaded"). NO clinical data enters the page: no counts, no
// diagnosis, no patient identity, no owner-workflow action. The aggregate performs no owner read at
// A2. Truthful loading + aggregate-error/Retry states; a failed request never renders deferred
// placeholders as though it succeeded. Entry gate (record:view), validated returnTo, and one-shot
// focus are preserved from A1. Workflow shortcuts + nav entry arrive in A13; Sign-Out is not touched.
// Contract: docs/PATHOS_DIAGNOSTIC_CASE_IMPLEMENTATION_PLAN.md (A2; §3, §6, §7).

import { useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, RotateCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui';
import type { CaseIdentitySection, DiagnosticCaseOverview, EffectiveDiagnosticPermissions, SectionStatus } from './types';

// Recorded dates render as plain calendar dates; null → "—". No relative/"ago" phrasing (which would
// imply a freshness judgment the owner does not record).
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
const dash = (v: string | null | undefined): string => (v && v.trim() ? v : '—');

// Only an internal, same-origin path may be a return target — reject external and protocol-relative
// URLs (open-redirect protection). Identical grammar to Sign-Out / Quality / Enterprise Administration.
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

// The nine frozen clinical bands, in the frozen order (plan §4). `key` matches the aggregate band
// key; `purpose` is a case-neutral description of what the band WILL compose — never a value, count,
// status, diagnosis, or AI result. The Permissions & Actions band (band 9) renders the descriptive
// permission map from `overview.permissions` (ready at A2); bands 1–8 render their band status.
type BandKey = Exclude<keyof DiagnosticCaseOverview, 'asOf' | 'recordId' | 'permissions'>;
const BANDS: { key: BandKey; title: string; purpose: string }[] = [
  { key: 'caseIdentity', title: 'Case Identity', purpose: 'The record’s identity, patient, lifecycle state, clinical indication, and assignment.' },
  { key: 'diagnosticMaterial', title: 'Diagnostic Material', purpose: 'Specimens, slide metadata, and attachments — the material under review. Images are opened on their viewer.' },
  { key: 'diagnosticInterpretation', title: 'Diagnostic Interpretation', purpose: 'Structured (Bethesda) findings, result-sheet state, and coding — each shown as its owner records it, never merged into a single diagnosis.' },
  { key: 'decisionSupport', title: 'Decision Support', purpose: 'Assistive material that supports, never replaces, interpretation. Any screening signal is labeled and non-diagnostic.' },
  { key: 'priorEvidence', title: 'Prior Evidence', purpose: 'The patient’s prior cases, cyto-histo correlation, and historical reports — clearly distinct from the current case.' },
  { key: 'collaboration', title: 'Collaboration', purpose: 'External consultation and escalation activity recorded for this case.' },
  { key: 'reportingSignOut', title: 'Reporting & Sign-Out', purpose: 'Result-sheet authorization state and the released report — opened and acted on in their owner systems.' },
  { key: 'timelineProvenance', title: 'Timeline & Provenance', purpose: 'Recorded status and authorization events for this case, source-labeled and non-canonical.' },
  { key: 'permissionsActions', title: 'Permissions & Actions', purpose: 'Which sections the current user may view and which owner actions are available.' },
];

export default function DiagnosticCaseWorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { can, hydrated } = useAuth();
  const recordId = String(params.recordId ?? '');
  const returnTo = safeReturnTo(searchParams.get('returnTo')) ?? '/records';
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedOnce = useRef(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['diagnostic-case-overview', recordId],
    queryFn: () => api.get<DiagnosticCaseOverview>(`/diagnostic-case/${recordId}/overview`).then((r) => r.data),
    enabled: hydrated && can('record:view') && !!recordId,
  });

  // Move focus to the workspace heading once on direct entry (accessibility). A one-shot ref guards
  // it so aggregate refetches can never steal focus.
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
  // authority. A caller without record:view sees a truthful No-access state — never clinical
  // placeholders rendered as if data were empty.
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

  const header = (
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
  );

  // Aggregate-level failure: show one truthful error + Retry. Never render deferred band placeholders
  // as though the request had succeeded.
  if (isError) {
    return (
      <div className="w-full">
        {header}
        <Card radius="md" elevation="soft" border="hairline" padding="lg">
          <EmptyState
            bare
            className="px-0 py-10"
            title="Couldn’t load this case"
            description="The diagnostic-case aggregate did not respond. No data is shown."
            action={<Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}><RotateCw size={14} className="mr-1.5" />{isFetching ? 'Retrying…' : 'Retry'}</Button>}
          />
        </Card>
      </div>
    );
  }

  const perms = data?.permissions?.status === 'ready' ? data.permissions.data : null;
  const identity = data?.caseIdentity;

  // Root-failure behavior: Case Identity is the root. If the record cannot be verified (error), we do
  // NOT paint the seven downstream clinical bands as "Not yet loaded" (that would imply a valid case
  // is loading). We render the truthful Case Identity error (with Retry) and keep the safe,
  // caller-scoped Permissions & Actions panel. Documented, truthful suppression (plan A3 §Failure).
  const rootError = !!data && identity?.status === 'error';
  const visibleBands = rootError ? BANDS.filter((b) => b.key === 'caseIdentity' || b.key === 'permissionsActions') : BANDS;

  return (
    <div className="w-full">
      {header}
      <div className="grid gap-4 lg:grid-cols-2">
        {visibleBands.map((b) => {
          if (b.key === 'permissionsActions') {
            return <PermissionsBand key={b.key} title={b.title} purpose={b.purpose} perms={perms} loading={isLoading} status={data?.permissions?.status} />;
          }
          if (b.key === 'caseIdentity') {
            return (
              <CaseIdentityBand
                key={b.key}
                title={b.title}
                purpose={b.purpose}
                section={identity}
                loading={isLoading}
                onRetry={() => refetch()}
                retrying={isFetching}
                onOpenRecord={(rid) => router.push(`/records/${rid}`)}
              />
            );
          }
          return <BandShell key={b.key} title={b.title} purpose={b.purpose} status={data?.[b.key]?.status} loading={isLoading} />;
        })}
      </div>
    </div>
  );
}

// A labeled recorded fact. Value "—" when the owner did not record it — never a warning, never inferred.
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-meta text-text-tertiary">{label}</dt>
      <dd className="text-sm text-text">{value}</dd>
    </div>
  );
}

// Band 1: Case Identity (A3). A restrained, read-only case header composed ONLY from RecordsService
// .findOne — recorded identity, patient, referring context, dates, and assignee. It is NOT a second
// record-detail page: no editing, no status transition, no patient/specimen editing. `status` is the
// stored value shown verbatim; `urgent` is a recorded flag (neutral, never an amber severity signal);
// `clinicalIndication` is the referring impression, never a diagnosis. One owner action: Open record.
function CaseIdentityBand({
  title,
  purpose,
  section,
  loading,
  onRetry,
  retrying,
  onOpenRecord,
}: {
  title: string;
  purpose: string;
  section?: { status: SectionStatus; data: CaseIdentitySection | null; reason?: string };
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
  onOpenRecord: (recordId: string) => void;
}) {
  const status = section?.status;
  const d = section?.data ?? null;
  const badge = loading || !status ? 'Loading' : status === 'ready' ? 'Ready' : status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : 'Not yet loaded';

  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{badge}</Badge>
        {d?.urgent && <Badge tone="neutral" size="xs">Urgent (recorded)</Badge>}
      </div>

      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-56" /><Skeleton shape="text" width="w-44" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view this record." />
      ) : status === 'error' ? (
        // Root error: the record could not be verified. Truthful message + Retry; the workspace does
        // not fabricate a case, and the downstream clinical bands are suppressed by the parent.
        <EmptyState
          bare
          className="px-0 py-8"
          title="This case could not be loaded"
          description={section?.reason === 'Record not found' ? 'No such record, or it is not in your laboratory.' : 'The record could not be loaded.'}
          action={<Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={14} className="mr-1.5" />{retrying ? 'Retrying…' : 'Retry'}</Button>}
        />
      ) : d ? (
        <>
          {/* Primary identity */}
          <div className="mb-3">
            <div className="text-lg font-bold leading-tight text-charcoal-heading">{dash(d.labNumber)}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-tertiary">
              <span title="System identifier">{d.identifier}</span>
              {d.formType && <><span aria-hidden>·</span><span>{d.formType}</span></>}
              <span aria-hidden>·</span>
              <Badge tone="neutral" size="xs">{d.status}</Badge>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Patient" value={dash(d.patient?.name ?? null)} />
            <Field label="MRN" value={dash(d.patient?.registrationNo ?? null)} />
            <Field label="Sex" value={dash(d.patient?.gender ?? null)} />
            <Field label="Date of birth" value={fmtDate(d.patient?.dateOfBirth ?? null)} />
            <Field label="Referring doctor" value={dash(d.referringDoctor)} />
            <Field label="Client / referrer" value={dash(d.client?.name ?? null)} />
            <Field label="Referring indication" value={dash(d.clinicalIndication)} />
            <Field label="Medical entry" value={dash(d.medicalEntry)} />
            <Field label="Specimen date" value={fmtDate(d.specimenDate)} />
            <Field label="Registered" value={fmtDate(d.registeredAt)} />
            <Field label="Status changed" value={fmtDate(d.statusChangedAt)} />
            <Field label="Assigned to" value={dash(d.assignedTo?.name ?? null)} />
          </dl>

          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={() => onOpenRecord(d.recordId)}>
              Open record <ExternalLink size={14} className="ml-1.5" />
            </Button>
          </div>
        </>
      ) : (
        <EmptyState bare className="px-0 py-8" title="Not yet loaded" description={purpose} />
      )}
    </Card>
  );
}

// One clinical band. Truthful states: loading ("Loading") / deferred ("Not yet loaded") / forbidden
// ("No access") / error ("Unavailable") / empty ("None recorded"). No data, counts, status, diagnosis,
// AI output, or owner-workflow buttons yet — the region only names what it WILL compose from its owner.
function BandShell({ title, purpose, status, loading }: { title: string; purpose: string; status?: SectionStatus; loading: boolean }) {
  const badge = status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : status === 'empty' ? 'None recorded' : loading || !status ? 'Loading' : 'Not yet loaded';
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view this section." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-8" title="Unavailable" description="This section could not be loaded." />
      ) : (
        // deferred (and, defensively, empty/ready which cannot occur for these bands until A3+)
        <EmptyState bare className="px-0 py-8" title="Not yet loaded" description={purpose} />
      )}
    </Card>
  );
}

// Permissions & Actions band (band 9) — ready at A2. Renders the descriptive permission map for the
// current caller: what they may view / do. It GRANTS NOTHING and shows NO clinical data — owner
// endpoints remain the enforcement authority. Booleans map to verified, seeded permission codes.
function PermissionsBand({ title, purpose, perms, loading, status }: { title: string; purpose: string; perms: EffectiveDiagnosticPermissions | null; loading: boolean; status?: SectionStatus }) {
  const CAPS: { key: keyof EffectiveDiagnosticPermissions; label: string; code: string }[] = [
    { key: 'viewRecord', label: 'View record', code: 'record:view' },
    { key: 'changeRecord', label: 'Change record', code: 'record:change' },
    { key: 'viewResultEntry', label: 'View result entries', code: 'resultentry:view' },
    { key: 'changeResultEntry', label: 'Change result entries', code: 'resultentry:change' },
    { key: 'viewResultSheet', label: 'View result sheets', code: 'resultsheet:view' },
    { key: 'createResultSheet', label: 'Create result sheets', code: 'resultsheet:create' },
    { key: 'authorizeResultSheet', label: 'Authorize result sheets', code: 'resultsheet:authorize' },
    { key: 'amend', label: 'Amend (edit + authorize)', code: 'resultentry:change + resultsheet:authorize' },
    { key: 'viewAiDraft', label: 'View AI drafts', code: 'aidraft:view' },
    { key: 'createAiDraft', label: 'Generate/review AI drafts', code: 'aidraft:create' },
    { key: 'viewReport', label: 'View reports', code: 'report:view' },
    { key: 'viewChangeRequests', label: 'View client requests', code: 'changerequest:view (unseeded → superuser-only)' },
  ];
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{loading || !status ? 'Loading' : status === 'ready' ? 'Ready' : status === 'error' ? 'Unavailable' : 'Not yet loaded'}</Badge>
      </div>
      {loading || !perms ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-56" /><Skeleton shape="text" width="w-44" /></div>
      ) : (
        <>
          <p className="mb-3 text-meta text-text-tertiary">{purpose} Descriptive only — owner endpoints remain authoritative.</p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5">
            {CAPS.map((c) => {
              const allowed = perms[c.key];
              return (
                <div key={c.key} className="flex items-center justify-between gap-3">
                  <dt className="text-sm text-text-secondary" title={c.code}>{c.label}</dt>
                  <dd>
                    <Badge tone={allowed ? 'info' : 'neutral'} size="xs">{allowed ? 'Allowed' : '—'}</Badge>
                  </dd>
                </div>
              );
            })}
          </dl>
          {perms.isSuperRole && (
            <p className="mt-3 text-meta text-text-tertiary">Super role — bypasses the permission guard on every owner endpoint.</p>
          )}
        </>
      )}
    </Card>
  );
}
