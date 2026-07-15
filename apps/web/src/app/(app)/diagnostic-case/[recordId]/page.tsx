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
import type { AncillaryOrdersSection, AttachmentsSubSection, BethesdaSubSection, CaseIdentitySection, CodingSubSection, CollaborationSection, CorrelationSubSection, DecisionSupportSection, DiagnosticCaseOverview, DiagnosticInterpretationSection, DiagnosticMaterialSection, EffectiveDiagnosticPermissions, PriorEvidenceSection, PriorRecordsSubSection, ReportingSignOutSection, ScreeningBatchesSection, SectionStatus, SlidesSubSection, TimelineProvenanceSection } from './types';

// Recorded dates render as plain calendar dates; null → "—". No relative/"ago" phrasing (which would
// imply a freshness judgment the owner does not record).
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
const dash = (v: string | null | undefined): string => (v && v.trim() ? v : '—');
// Recorded byte size → human units; null/invalid → "—". Display only, no rounding claims beyond 1 dp.
function fmtBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

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
  { key: 'ancillaryOrders', title: 'Ancillary Orders', purpose: 'Ancillary and IHC orders recorded for this case — observed here; ordered and resolved in their owner workspace.' },
  { key: 'screeningBatches', title: 'Screening Batch', purpose: 'Cytotechnologist screening batches this case belongs to — observed here; managed in their owner workspace. Not a diagnosis or QC outcome.' },
  { key: 'diagnosticInterpretation', title: 'Diagnostic Interpretation', purpose: 'Structured (Bethesda) findings, result-sheet state, and coding — each shown as its owner records it, never merged into a single diagnosis.' },
  { key: 'decisionSupport', title: 'Decision Support', purpose: 'Assistive material that supports, never replaces, interpretation. Any screening signal is labeled and non-diagnostic.' },
  { key: 'priorEvidence', title: 'Prior Evidence', purpose: 'The patient’s prior cases (this case excluded) and cyto-histo correlations recorded for this patient.' },
  { key: 'collaboration', title: 'Collaboration', purpose: 'External consultation and escalation activity recorded for this case.' },
  { key: 'reportingSignOut', title: 'Reporting & Sign-Out', purpose: 'Result-sheet authorization state and whether a report is recorded — opened and acted on in their owner systems.' },
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
          if (b.key === 'diagnosticMaterial') {
            return (
              <DiagnosticMaterialBand
                key={b.key}
                title={b.title}
                purpose={b.purpose}
                section={data?.diagnosticMaterial}
                loading={isLoading}
                onRetry={() => refetch()}
                retrying={isFetching}
                onOpenSlide={(sid) => router.push(`/wsi/${sid}`)}
              />
            );
          }
          if (b.key === 'diagnosticInterpretation') {
            return (
              <DiagnosticInterpretationBand
                key={b.key}
                title={b.title}
                section={data?.diagnosticInterpretation}
                loading={isLoading}
                onRetry={() => refetch()}
                retrying={isFetching}
              />
            );
          }
          if (b.key === 'decisionSupport') {
            return (
              <DecisionSupportBand
                key={b.key}
                title={b.title}
                section={data?.decisionSupport}
                loading={isLoading}
                onRetry={() => refetch()}
                retrying={isFetching}
              />
            );
          }
          if (b.key === 'priorEvidence') {
            return (
              <PriorEvidenceBand
                key={b.key}
                title={b.title}
                section={data?.priorEvidence}
                loading={isLoading}
                onRetry={() => refetch()}
                retrying={isFetching}
                onOpenRecord={(rid) => router.push(`/records/${rid}`)}
                onOpenCorrelation={(cid) => router.push(`/correlation/${cid}`)}
              />
            );
          }
          if (b.key === 'ancillaryOrders') {
            return (
              <AncillaryOrdersBand
                key={b.key}
                title={b.title}
                section={data?.ancillaryOrders}
                loading={isLoading}
                onRetry={() => refetch()}
                retrying={isFetching}
                onOpen={() => router.push('/ancillary-orders')}
              />
            );
          }
          if (b.key === 'screeningBatches') {
            return (
              <ScreeningBatchBand
                key={b.key}
                title={b.title}
                section={data?.screeningBatches}
                loading={isLoading}
                onRetry={() => refetch()}
                retrying={isFetching}
                onOpen={() => router.push('/screening-batches')}
              />
            );
          }
          if (b.key === 'collaboration') {
            return (
              <CollaborationBand
                key={b.key}
                title={b.title}
                section={data?.collaboration}
                loading={isLoading}
                onRetry={() => refetch()}
                retrying={isFetching}
                onOpenEscalations={() => router.push('/escalations')}
              />
            );
          }
          if (b.key === 'reportingSignOut') {
            return (
              <ReportingSignOutBand
                key={b.key}
                title={b.title}
                section={data?.reportingSignOut}
                loading={isLoading}
                onRetry={() => refetch()}
                retrying={isFetching}
                onOpenSignOut={() => router.push(`/sign-out/${recordId}`)}
              />
            );
          }
          if (b.key === 'timelineProvenance') {
            return (
              <TimelineProvenanceBand
                key={b.key}
                title={b.title}
                section={data?.timelineProvenance}
                loading={isLoading}
                onRetry={() => refetch()}
                retrying={isFetching}
                onOpen={(path) => router.push(path)}
              />
            );
          }
          // Defensive fallback: every band key above is handled, so this is unreachable (b.key is `never`).
          return <BandShell key={b.key} title={b.title} purpose={b.purpose} loading={isLoading} />;
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

// Band 2: Diagnostic Material (A4). Recorded specimen/material evidence composed from the record read.
// Display-only (Case Identity already offers "Open record" — no duplicate handoff). No images, no
// slides, no attachments, no interpretation, no adequacy/quality verdict. Nulls render "—". A footnote
// states the record-centric truth: slides/attachments/AI are recorded against the case, not a specimen.
function DiagnosticMaterialBand({
  title,
  purpose,
  section,
  loading,
  onRetry,
  retrying,
  onOpenSlide,
}: {
  title: string;
  purpose: string;
  section?: { status: SectionStatus; data: DiagnosticMaterialSection | null; reason?: string };
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
  onOpenSlide: (slideId: string) => void;
}) {
  const status = section?.status;
  const d = section?.data ?? null;
  const total = d?.summary.total ?? 0;
  // Band badge is now source-agnostic (the band is multi-source: specimens + slides + attachments).
  // Each sub-source shows its own count; the band is `empty` only when ALL sources are empty.
  const badge = loading || !status ? 'Loading' : status === 'ready' ? 'Ready' : status === 'empty' ? 'None recorded' : status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : 'Not yet loaded';
  // Sub-source failures split by cause (technical vs access) — same presentation as the other
  // multi-source bands (Interpretation, Prior Evidence): "Couldn't load" vs "Access restricted", never merged.
  const failed = d ? [d.slides.status === 'error' ? 'Slides' : null, d.attachments.status === 'error' ? 'Attachments' : null].filter(Boolean) : [];
  const restricted = d ? [d.slides.status === 'forbidden' ? 'Slides' : null, d.attachments.status === 'forbidden' ? 'Attachments' : null].filter(Boolean) : [];

  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>

      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-52" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view this section." />
      ) : status === 'error' ? (
        // Band-level error: no material to show AND ≥1 source failed. `reason` names the failed source(s)
        // truthfully; a resolved-but-empty sibling is never reported as this band's content.
        <EmptyState
          bare
          className="px-0 py-8"
          title="Unavailable"
          description={section?.reason ?? 'Recorded specimen material could not be loaded.'}
          action={<Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={14} className="mr-1.5" />{retrying ? 'Retrying…' : 'Retry'}</Button>}
        />
      ) : (
        // ready or empty — either way, show the recorded specimens (or an honest "none"), then the
        // record-centric note and the two sub-areas that hydrate later (Slides = A5, Attachments = A6),
        // kept VISIBLY deferred so the band's future shape is truthful, never implied to be specimen-linked.
        <>
          {status === 'empty' || !d || d.specimens.length === 0 ? (
            <EmptyState bare className="px-0 py-6" title="No specimens recorded" description="No specimen material has been recorded for this case." />
          ) : (
            <>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-left text-meta text-text-tertiary">
                      <th className="px-1 py-1 font-medium">Specimen</th>
                      <th className="px-1 py-1 font-medium">Type</th>
                      <th className="px-1 py-1 font-medium">Container</th>
                      <th className="px-1 py-1 font-medium">Blood group</th>
                      <th className="px-1 py-1 font-medium">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.specimens.map((s) => (
                      <tr key={s.id} className="border-t border-hairline">
                        <td className="px-1 py-1.5 text-text">{dash(s.label)}</td>
                        <td className="px-1 py-1.5 text-text-secondary">{dash(s.type)}</td>
                        <td className="px-1 py-1.5 text-text-secondary">{dash(s.container)}</td>
                        <td className="px-1 py-1.5 text-text-secondary">{dash(s.bloodGroup)}</td>
                        <td className="px-1 py-1.5 text-text-secondary">{fmtDate(s.receivedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.specimens.length < total && (
                <p className="mt-2 text-meta text-text-tertiary">Showing the first {d.specimens.length} of {total} recorded specimens.</p>
              )}
            </>
          )}
          <p className="mt-3 text-meta text-text-tertiary">Recorded specimen material only. Slides and attachments are recorded against the case, not linked to a specific specimen.</p>
          <div className="mt-3 border-t border-hairline pt-3">
            <SlidesSubArea slides={d?.slides} onOpenSlide={onOpenSlide} onRetry={onRetry} retrying={retrying} />
          </div>
          <div className="mt-3 border-t border-hairline pt-3">
            <AttachmentsSubArea attachments={d?.attachments} onRetry={onRetry} retrying={retrying} />
          </div>
          {failed.length > 0 && (
            <p className="mt-3 text-meta text-text-tertiary">Couldn’t load: {failed.join(', ')}.</p>
          )}
          {restricted.length > 0 && (
            <p className="mt-1 text-meta text-text-tertiary">Access restricted: {restricted.join(', ')}.</p>
          )}
        </>
      )}
    </Card>
  );
}

// A5: Slides / Imaging sub-area within Diagnostic Material. Composed from WsiService.listByRecordMeta
// (metadata only). Isolated status: a WSI failure shows here (Unavailable + Retry) without affecting the
// specimen list. Metadata is caller-asserted (labeled), never a verified-scan claim; no thumbnails, no
// image bytes. "Open slide" hands off to the existing /wsi/:id owner viewer — no viewer is reimplemented.
function SlidesSubArea({
  slides,
  onOpenSlide,
  onRetry,
  retrying,
}: {
  slides?: SlidesSubSection;
  onOpenSlide: (slideId: string) => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const status = slides?.status;
  const total = slides?.total ?? 0;
  const badge = !status ? 'Loading' : status === 'ready' ? `${total} slide${total === 1 ? '' : 's'}` : status === 'empty' ? 'None recorded' : status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : 'Not yet loaded';
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text">Slides (imaging)</span>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {!status ? (
        <Skeleton shape="text" width="w-40" />
      ) : status === 'forbidden' ? (
        <p className="text-meta text-text-tertiary">You do not have permission to view slides.</p>
      ) : status === 'error' ? (
        <div className="flex items-center gap-3">
          <p className="text-meta text-text-tertiary">Recorded slides could not be loaded.</p>
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={12} className="mr-1" />{retrying ? 'Retrying…' : 'Retry'}</Button>
        </div>
      ) : status === 'empty' || !slides || slides.items.length === 0 ? (
        <p className="text-meta text-text-tertiary">No slides recorded for this case.</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {slides.items.map((s) => {
              const meta = [s.magnification, s.scanner, s.format, fmtBytes(s.fileSizeBytes), fmtDate(s.uploadedAt)].filter((v) => v && v !== '—');
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded border border-hairline px-2.5 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-text">{dash(s.stain)}</div>
                    <div className="truncate text-meta text-text-tertiary">{meta.length ? meta.join(' · ') : 'Recorded slide'}</div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => onOpenSlide(s.id)}>
                    Open slide <ExternalLink size={12} className="ml-1" />
                  </Button>
                </li>
              );
            })}
          </ul>
          {slides.items.length < total && (
            <p className="mt-2 text-meta text-text-tertiary">Showing the first {slides.items.length} of {total} recorded slides.</p>
          )}
          <p className="mt-2 text-meta text-text-tertiary">Slide metadata is as recorded at upload; opening a slide hands off to the viewer.</p>
        </>
      )}
    </div>
  );
}

// A6: Attachments sub-area within Diagnostic Material. Composed from FilesService.getRecordAttachments
// (metadata only — filename, recorded MIME, created date). DISPLAY-ONLY: no download/preview/upload/
// delete/rename, no thumbnails, no inline render — FilesService remains the sole binary-delivery owner.
// Isolated status: a Files failure shows here (Unavailable + Retry) without affecting specimens/slides.
// Record-anchored; never implied to belong to a specimen, slide, or result. No semantic inference.
function AttachmentsSubArea({
  attachments,
  onRetry,
  retrying,
}: {
  attachments?: AttachmentsSubSection;
  onRetry: () => void;
  retrying: boolean;
}) {
  const status = attachments?.status;
  const total = attachments?.total ?? 0;
  const badge = !status ? 'Loading' : status === 'ready' ? `${total} attachment${total === 1 ? '' : 's'}` : status === 'empty' ? 'None recorded' : status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : 'Not yet loaded';
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text">Attachments</span>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {!status ? (
        <Skeleton shape="text" width="w-40" />
      ) : status === 'forbidden' ? (
        <p className="text-meta text-text-tertiary">You do not have permission to view attachments.</p>
      ) : status === 'error' ? (
        <div className="flex items-center gap-3">
          <p className="text-meta text-text-tertiary">Recorded attachments could not be loaded.</p>
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={12} className="mr-1" />{retrying ? 'Retrying…' : 'Retry'}</Button>
        </div>
      ) : status === 'empty' || !attachments || attachments.items.length === 0 ? (
        <p className="text-meta text-text-tertiary">No attachments recorded for this case.</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {attachments.items.map((a) => {
              const meta = [a.fileType, fmtDate(a.createdAt)].filter((v) => v && v !== '—');
              return (
                <li key={a.id} className="rounded border border-hairline px-2.5 py-1.5">
                  <div className="truncate text-sm text-text">{dash(a.name)}</div>
                  <div className="truncate text-meta text-text-tertiary">{meta.length ? meta.join(' · ') : 'Recorded attachment'}</div>
                </li>
              );
            })}
          </ul>
          {attachments.items.length < total && (
            <p className="mt-2 text-meta text-text-tertiary">Showing the first {attachments.items.length} of {total} recorded attachments.</p>
          )}
          <p className="mt-2 text-meta text-text-tertiary">Attachment metadata only; files open in the record’s file owner.</p>
        </>
      )}
    </div>
  );
}

// Band 3: Diagnostic Interpretation (A7). Two INDEPENDENT owner-recorded sub-sources (Bethesda, Coding),
// shown SEPARATELY — never merged into a diagnosis, never labeled final/definitive/confirmed. Display-
// only (no editor/authorize/amend/suggest). Band-level forbidden (both sources forbidden) / error
// (no evidence + a source failed) render at the band; otherwise the two sub-areas render with their own
// truthful states. A resolved-but-empty sibling never hides a forbidden/errored source (unavailable[]).
function DiagnosticInterpretationBand({
  title,
  section,
  loading,
  onRetry,
  retrying,
}: {
  title: string;
  section?: { status: SectionStatus; data: DiagnosticInterpretationSection | null; reason?: string };
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
}) {
  const status = section?.status;
  const d = section?.data ?? null;
  const badge = loading || !status ? 'Loading' : status === 'ready' ? 'Recorded' : status === 'empty' ? 'None recorded' : status === 'forbidden' ? 'Restricted' : status === 'error' ? 'Unavailable' : 'Not yet loaded';
  // Distinguish access restriction (forbidden — no Retry) from technical failure (error — with Retry),
  // derived from the sub-source states so the band never describes forbidden as a technical failure.
  const restricted = d ? [d.bethesda.status === 'forbidden' ? 'Bethesda' : null, d.coding.status === 'forbidden' ? 'Coding' : null].filter(Boolean) : [];
  const failed = d ? [d.bethesda.status === 'error' ? 'Bethesda' : null, d.coding.status === 'error' ? 'Coding' : null].filter(Boolean) : [];
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-52" /><Skeleton shape="text" width="w-40" /></div>
      ) : !d ? (
        // No sub-source data → root failure (record read forbidden/error). Root forbidden shows No access
        // (no Retry); root error shows Unavailable + Retry (technical).
        status === 'forbidden' ? (
          <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view the recorded interpretation." />
        ) : (
          <EmptyState
            bare
            className="px-0 py-8"
            title="Unavailable"
            description={section?.reason ?? 'Recorded interpretation could not be loaded.'}
            action={<Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={14} className="mr-1.5" />{retrying ? 'Retrying…' : 'Retry'}</Button>}
          />
        )
      ) : (
        // Data present — ALWAYS render both sub-sources so an accessible-empty sibling stays visible even
        // when the band is forbidden/error. Each sub-area is self-describing: forbidden → "No access"
        // (no Retry), error → "Unavailable" + Retry, empty, or ready.
        <>
          <p className="mb-3 text-meta text-text-tertiary">Owner-recorded classification and coding, shown separately — not combined into a diagnosis.</p>
          <BethesdaSubArea bethesda={d.bethesda} onRetry={onRetry} retrying={retrying} />
          <div className="mt-3 border-t border-hairline pt-3">
            <CodingSubArea coding={d.coding} onRetry={onRetry} retrying={retrying} />
          </div>
          {failed.length > 0 && (
            <p className="mt-3 text-meta text-text-tertiary">Couldn’t load: {failed.join(', ')}.</p>
          )}
          {restricted.length > 0 && (
            <p className="mt-1 text-meta text-text-tertiary">Access restricted: {restricted.join(', ')}.</p>
          )}
        </>
      )}
    </Card>
  );
}

// Bethesda sub-area (A7). Owner-recorded structured classification (The Bethesda System — cervical
// cytology). One per record. Fields shown verbatim; nulls "—". No inference, no diagnosis synthesis.
// `generatedNarrative` is intentionally NOT surfaced (owner-generated prose without review state).
function BethesdaSubArea({ bethesda, onRetry, retrying }: { bethesda?: BethesdaSubSection; onRetry: () => void; retrying: boolean }) {
  const status = bethesda?.status;
  const d = bethesda?.data ?? null;
  const badge = !status ? 'Loading' : status === 'ready' ? 'Recorded' : status === 'empty' ? 'None recorded' : status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : '—';
  const arrays: [string, string[]][] = d ? [['Organisms', d.organisms], ['Other non-neoplastic', d.otherNonNeoplastic]] : [];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text">Bethesda <span className="font-normal text-text-tertiary">· cervical cytology</span></span>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {!status ? (
        <Skeleton shape="text" width="w-48" />
      ) : status === 'forbidden' ? (
        <p className="text-meta text-text-tertiary">You do not have permission to view Bethesda results.</p>
      ) : status === 'error' ? (
        <div className="flex items-center gap-3">
          <p className="text-meta text-text-tertiary">Recorded Bethesda result could not be loaded.</p>
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={12} className="mr-1" />{retrying ? 'Retrying…' : 'Retry'}</Button>
        </div>
      ) : status === 'empty' || !d ? (
        <p className="text-meta text-text-tertiary">No Bethesda result recorded for this case.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field label="Adequacy" value={dash(d.adequacy)} />
            <Field label="Short code" value={dash(d.shortCode)} />
            <Field label="General category" value={dash(d.generalCategory)} />
            <Field label="Squamous" value={dash(d.squamousCategory)} />
            <Field label="ASC subtype" value={dash(d.ascSubtype)} />
            <Field label="Glandular" value={dash(d.glandularCategory)} />
            <Field label="Glandular subtype" value={dash(d.glandularSubtype)} />
            <Field label="Other malignancy" value={dash(d.otherMalignancy)} />
            <Field label="HPV result" value={dash(d.hpvResult)} />
            <Field label="HPV genotype" value={dash(d.hpvGenotype)} />
            <Field label="Recommendation" value={dash(d.recommendation)} />
            <Field label="Unsatisfactory reason" value={dash(d.unsatisfactoryReason)} />
            <Field label="Reported by" value={dash(d.reportedBy)} />
            <Field label="Reported" value={fmtDate(d.reportedAt)} />
          </dl>
          {arrays.filter(([, v]) => v && v.length).map(([label, v]) => (
            <div key={label} className="mt-2">
              <dt className="text-meta text-text-tertiary">{label}</dt>
              <dd className="text-sm text-text">{v.join(', ')}</dd>
            </div>
          ))}
          {d.recommendationNotes && (
            <div className="mt-2">
              <dt className="text-meta text-text-tertiary">Recommendation notes</dt>
              <dd className="text-sm text-text">{d.recommendationNotes}</dd>
            </div>
          )}
          <p className="mt-2 text-meta text-text-tertiary">Owner-recorded classification (The Bethesda System). Shown as recorded — not a diagnosis.</p>
        </>
      )}
    </div>
  );
}

// Coding sub-area (A7). Owner-recorded codes (SNOMED/ICD/LOINC via the coding owner). Metadata only;
// nulls "—". No "primary/severe/malignant" labels unless the owner records them; no inference.
function CodingSubArea({ coding, onRetry, retrying }: { coding?: CodingSubSection; onRetry: () => void; retrying: boolean }) {
  const status = coding?.status;
  const total = coding?.total ?? 0;
  const badge = !status ? 'Loading' : status === 'ready' ? `${total} code${total === 1 ? '' : 's'}` : status === 'empty' ? 'None recorded' : status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : '—';
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text">Coding</span>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {!status ? (
        <Skeleton shape="text" width="w-40" />
      ) : status === 'forbidden' ? (
        <p className="text-meta text-text-tertiary">You do not have permission to view coding.</p>
      ) : status === 'error' ? (
        <div className="flex items-center gap-3">
          <p className="text-meta text-text-tertiary">Recorded coding could not be loaded.</p>
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={12} className="mr-1" />{retrying ? 'Retrying…' : 'Retry'}</Button>
        </div>
      ) : status === 'empty' || !coding || coding.items.length === 0 ? (
        <p className="text-meta text-text-tertiary">No coding recorded for this case.</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {coding.items.map((c) => {
              const primary = [c.system, c.code].filter(Boolean).join(' ');
              const meta = [c.category, c.codeType, c.assignedBy, fmtDate(c.assignedAt)].filter((v) => v && v !== '—');
              return (
                <li key={c.id} className="rounded border border-hairline px-2.5 py-1.5">
                  <div className="truncate text-sm text-text">{dash(c.display)}</div>
                  <div className="truncate text-meta text-text-tertiary">{[primary || null, ...meta].filter(Boolean).join(' · ') || 'Recorded code'}</div>
                </li>
              );
            })}
          </ul>
          {coding.items.length < total && (
            <p className="mt-2 text-meta text-text-tertiary">Showing the first {coding.items.length} of {total} recorded codes.</p>
          )}
        </>
      )}
    </div>
  );
}

// Band 4: Decision Support (A8). SINGLE source — AI-assisted reporting draft METADATA. Display-only:
// no accept/reject/regenerate, no AI workflow, no owner-lifecycle duplication. Metadata only — the
// generated text stays in the reporting owner; `edited` is a presence flag (no diff/prose). AI Screening
// is excluded. Root failure (data null) renders a band-level message; otherwise the AI-drafts sub-source
// state (ready/empty/forbidden/error) renders, with Retry only for technical error.
function DecisionSupportBand({
  title,
  section,
  loading,
  onRetry,
  retrying,
}: {
  title: string;
  section?: { status: SectionStatus; data: DecisionSupportSection | null; reason?: string };
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
}) {
  const status = section?.status;
  const d = section?.data ?? null;
  const drafts = d?.aiDrafts;
  const total = drafts?.total ?? 0;
  const badge = loading || !status ? 'Loading'
    : status === 'ready' ? `${total} AI draft${total === 1 ? '' : 's'}`
    : status === 'empty' ? 'None recorded'
    : status === 'forbidden' ? 'No access'
    : status === 'error' ? 'Unavailable' : 'Not yet loaded';
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-52" /><Skeleton shape="text" width="w-40" /></div>
      ) : !d || !drafts ? (
        // root failure (record read forbidden/error): band-level message. forbidden → No access (no Retry).
        status === 'forbidden' ? (
          <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view decision support." />
        ) : (
          <EmptyState bare className="px-0 py-8" title="Unavailable" description={section?.reason ?? 'Decision support could not be loaded.'} action={<Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={14} className="mr-1.5" />{retrying ? 'Retrying…' : 'Retry'}</Button>} />
        )
      ) : drafts.status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view AI reporting drafts." />
      ) : drafts.status === 'error' ? (
        <div className="flex items-center gap-3">
          <p className="text-meta text-text-tertiary">Recorded AI drafts could not be loaded.</p>
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={12} className="mr-1" />{retrying ? 'Retrying…' : 'Retry'}</Button>
        </div>
      ) : drafts.status === 'empty' || drafts.items.length === 0 ? (
        <EmptyState bare className="px-0 py-6" title="No AI drafts recorded" description="No AI reporting drafts recorded for this case." />
      ) : (
        <>
          <p className="mb-2 text-meta text-text-tertiary">AI-assisted reporting drafts — metadata only. The generated text stays in the reporting owner; this is assistive provenance, not a diagnosis.</p>
          <ul className="space-y-1.5">
            {drafts.items.map((a) => {
              const meta = [a.model, a.promptVersion, a.createdBy, fmtDate(a.createdAt), a.acceptedBy ? `accepted by ${a.acceptedBy}` : null, a.edited ? 'edited' : null].filter((v) => v && v !== '—');
              return (
                <li key={a.id} className="rounded border border-hairline px-2.5 py-1.5">
                  <div className="truncate text-sm text-text">{dash(a.kind)} <span className="text-text-tertiary">· {dash(a.status)}</span></div>
                  <div className="truncate text-meta text-text-tertiary">{meta.length ? meta.join(' · ') : 'Recorded AI draft'}</div>
                </li>
              );
            })}
          </ul>
          {drafts.items.length < total && (
            <p className="mt-2 text-meta text-text-tertiary">Showing the first {drafts.items.length} of {total} recorded AI drafts.</p>
          )}
        </>
      )}
    </Card>
  );
}

// Band 5: Prior Evidence (A9). Two patient-anchored sub-sources shown SEPARATELY — Prior Records (with
// embedded historical Bethesda; the current record is excluded by the owner method) and Correlation
// (existence + owner-recorded classification only; patient-level, so a case tied to the current record
// MAY appear and is labeled neutrally — never called "prior"). Display-only + owner navigation. Shown as
// recorded; never compared to the current case; no progression/recurrence/trend/concordance inference.
function PriorEvidenceBand({
  title,
  section,
  loading,
  onRetry,
  retrying,
  onOpenRecord,
  onOpenCorrelation,
}: {
  title: string;
  section?: { status: SectionStatus; data: PriorEvidenceSection | null; reason?: string };
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
  onOpenRecord: (recordId: string) => void;
  onOpenCorrelation: (correlationId: string) => void;
}) {
  const status = section?.status;
  const d = section?.data ?? null;
  const badge = loading || !status ? 'Loading' : status === 'ready' ? 'Recorded' : status === 'empty' ? 'None recorded' : status === 'forbidden' ? 'Restricted' : status === 'error' ? 'Unavailable' : 'Not yet loaded';
  const failed = d ? [d.priorRecords.status === 'error' ? 'Prior records' : null, d.correlation.status === 'error' ? 'Correlation' : null].filter(Boolean) : [];
  const restricted = d ? [d.priorRecords.status === 'forbidden' ? 'Prior records' : null, d.correlation.status === 'forbidden' ? 'Correlation' : null].filter(Boolean) : [];
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-52" /><Skeleton shape="text" width="w-40" /></div>
      ) : !d ? (
        status === 'forbidden' ? (
          <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view prior evidence." />
        ) : (
          <EmptyState bare className="px-0 py-8" title="Unavailable" description={section?.reason ?? 'Prior evidence could not be loaded.'} action={<Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={14} className="mr-1.5" />{retrying ? 'Retrying…' : 'Retry'}</Button>} />
        )
      ) : (
        <>
          <p className="mb-3 text-meta text-text-tertiary">Prior cases (this case excluded) and cyto-histo correlations recorded for this patient — shown as recorded, never compared to the current case.</p>
          <PriorRecordsSubArea priorRecords={d.priorRecords} onOpenRecord={onOpenRecord} onRetry={onRetry} retrying={retrying} />
          <div className="mt-3 border-t border-hairline pt-3">
            <CorrelationSubArea correlation={d.correlation} onOpenCorrelation={onOpenCorrelation} onRetry={onRetry} retrying={retrying} />
          </div>
          {failed.length > 0 && <p className="mt-3 text-meta text-text-tertiary">Couldn’t load: {failed.join(', ')}.</p>}
          {restricted.length > 0 && <p className="mt-1 text-meta text-text-tertiary">Access restricted: {restricted.join(', ')}.</p>}
        </>
      )}
    </Card>
  );
}

// Prior Records sub-area (A9). Prior cases for the patient, each with embedded historical Bethesda and
// result-sheet/report presence. Display-only + "Open record" → /records/:id. Each labeled with its date.
function PriorRecordsSubArea({ priorRecords, onOpenRecord, onRetry, retrying }: { priorRecords?: PriorRecordsSubSection; onOpenRecord: (id: string) => void; onRetry: () => void; retrying: boolean }) {
  const status = priorRecords?.status;
  const total = priorRecords?.total ?? 0;
  const badge = !status ? 'Loading' : status === 'ready' ? `${total} prior case${total === 1 ? '' : 's'}` : status === 'empty' ? 'None recorded' : status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : '—';
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text">Prior cases</span>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {!status ? (
        <Skeleton shape="text" width="w-44" />
      ) : status === 'forbidden' ? (
        <p className="text-meta text-text-tertiary">You do not have permission to view prior cases.</p>
      ) : status === 'error' ? (
        <div className="flex items-center gap-3"><p className="text-meta text-text-tertiary">Prior cases could not be loaded.</p><Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={12} className="mr-1" />{retrying ? 'Retrying…' : 'Retry'}</Button></div>
      ) : status === 'empty' || !priorRecords || priorRecords.items.length === 0 ? (
        <p className="text-meta text-text-tertiary">No prior cases recorded for this patient.</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {priorRecords.items.map((p) => {
              const beth = p.bethesda ? [p.bethesda.generalCategory, p.bethesda.squamousCategory, p.bethesda.glandularCategory, p.bethesda.adequacy].filter(Boolean).join(' / ') : null;
              const meta = [p.formType, fmtDate(p.specimenDate), beth || null, p.hasReport ? 'report recorded' : p.hasAuthorizedResultSheet ? 'authorized' : null].filter((v) => v && v !== '—');
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded border border-hairline px-2.5 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-text">{dash(p.labNumber)} <span className="text-text-tertiary">· {p.status}</span></div>
                    <div className="truncate text-meta text-text-tertiary">{meta.length ? meta.join(' · ') : 'Recorded case'}</div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => onOpenRecord(p.id)}>Open record <ExternalLink size={12} className="ml-1" /></Button>
                </li>
              );
            })}
          </ul>
          {priorRecords.items.length < total && <p className="mt-2 text-meta text-text-tertiary">Showing the first {priorRecords.items.length} of {total} prior cases.</p>}
        </>
      )}
    </div>
  );
}

// Correlation sub-area (A9). Patient-level (CorrelationService.byPatient) — existence + owner-recorded
// classification only. A correlation tied to the CURRENT record may appear; it is labeled neutrally as a
// patient correlation, NEVER as "prior." Display-only + "Open correlation" → /correlation/:id. No
// diagnoses/notes/review/outcome (those live in the correlation owner). correlationResult shown verbatim.
function CorrelationSubArea({ correlation, onOpenCorrelation, onRetry, retrying }: { correlation?: CorrelationSubSection; onOpenCorrelation: (id: string) => void; onRetry: () => void; retrying: boolean }) {
  const status = correlation?.status;
  const total = correlation?.total ?? 0;
  const badge = !status ? 'Loading' : status === 'ready' ? `${total} correlation${total === 1 ? '' : 's'}` : status === 'empty' ? 'None recorded' : status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : '—';
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text">Cyto-histo correlation</span>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {!status ? (
        <Skeleton shape="text" width="w-40" />
      ) : status === 'forbidden' ? (
        <p className="text-meta text-text-tertiary">You do not have permission to view correlation.</p>
      ) : status === 'error' ? (
        <div className="flex items-center gap-3"><p className="text-meta text-text-tertiary">Correlation could not be loaded.</p><Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={12} className="mr-1" />{retrying ? 'Retrying…' : 'Retry'}</Button></div>
      ) : status === 'empty' || !correlation || correlation.items.length === 0 ? (
        <p className="text-meta text-text-tertiary">No cyto-histo correlation recorded for this patient.</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {correlation.items.map((c) => {
              const meta = [c.histologySource, c.externalLabName, fmtDate(c.cytologyDate), c.histologyDate ? `histology ${fmtDate(c.histologyDate)}` : null].filter((v) => v && v !== '—');
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded border border-hairline px-2.5 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-text">{dash(c.correlationResult)}</div>
                    <div className="truncate text-meta text-text-tertiary">{meta.length ? meta.join(' · ') : 'Recorded correlation'}</div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => onOpenCorrelation(c.id)}>Open correlation <ExternalLink size={12} className="ml-1" /></Button>
                </li>
              );
            })}
          </ul>
          {correlation.items.length < total && <p className="mt-2 text-meta text-text-tertiary">Showing the first {correlation.items.length} of {total} correlation cases.</p>}
          <p className="mt-2 text-meta text-text-tertiary">Cyto-histo correlations recorded for this patient; may include one tied to the current case.</p>
        </>
      )}
    </div>
  );
}

// Band 6: Collaboration (A10). SINGLE source — record-scoped escalation metadata. Display-only: no
// acknowledge/resolve/reassign/close/notify/review/create/edit controls; no teleconsult or notes (no
// safe Record-scoped owner read exists). severity/trigger/status shown VERBATIM (owner-recorded); the
// notification is shown as a RECORDED fact ("Notification recorded"), never "delivered/received."
// B7: Ancillary Orders — read-only observation of the AncillaryOrders owner. One action (Open
// Ancillary Orders → owner workspace); NO inline create/start/complete/cancel. Statuses shown
// verbatim; "Blocks Sign-Out" is surfaced only for OPEN orders (Ordered/InProcess), never claimed
// for a closed order. Nothing implies testing complete / results / reviewed / released.
function AncillaryOrdersBand({
  title,
  section,
  loading,
  onRetry,
  retrying,
  onOpen,
}: {
  title: string;
  section?: { status: SectionStatus; data: AncillaryOrdersSection | null; reason?: string };
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
  onOpen: () => void;
}) {
  const status = section?.status;
  const d = section?.data ?? null;
  const total = d?.total ?? 0;
  const badge =
    loading || !status ? 'Loading'
    : status === 'ready' ? `${total} order${total === 1 ? '' : 's'}`
    : status === 'empty' ? 'None recorded'
    : status === 'forbidden' ? 'No access'
    : status === 'error' ? 'Unavailable'
    : 'Not yet loaded';
  const label = (s: string) => (s === 'InProcess' ? 'In Process' : s);
  const isOpen = (s: string) => s === 'Ordered' || s === 'InProcess';
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-52" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view ancillary orders." />
      ) : status === 'error' || !d ? (
        <EmptyState bare className="px-0 py-8" title="Unavailable" description={section?.reason ?? 'Ancillary orders could not be loaded.'} action={<Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={14} className="mr-1.5" />{retrying ? 'Retrying…' : 'Retry'}</Button>} />
      ) : status === 'empty' || d.items.length === 0 ? (
        <EmptyState bare className="px-0 py-6" title="No ancillary orders recorded" description="No ancillary or IHC orders are recorded for this case." />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-text">Ancillary orders</span>
            <Button variant="secondary" size="sm" onClick={onOpen}>Open Ancillary Orders <ExternalLink size={12} className="ml-1" /></Button>
          </div>
          <ul className="space-y-1.5">
            {d.items.map((o) => {
              const meta = [
                fmtDate(o.orderedAt) !== '—' ? `ordered ${fmtDate(o.orderedAt)}` : null,
                o.completedAt ? `completed ${fmtDate(o.completedAt)}` : null,
                o.notes ? o.notes : null,
              ].filter((v) => v && v !== '—');
              return (
                <li key={o.id} className="rounded border border-hairline px-2.5 py-1.5">
                  <div className="truncate text-sm text-text">
                    {dash(o.kind)} · {dash(o.target)} <span className="text-text-tertiary">· {label(o.status)}</span>
                    {o.blocksSignOut && isOpen(o.status) && <Badge tone="danger" size="xs" className="ml-1.5">Blocks Sign-Out</Badge>}
                  </div>
                  <div className="truncate text-meta text-text-tertiary">{meta.length ? meta.join(' · ') : 'Recorded order'}</div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

// C8: Screening Batch band — read-only, allowlisted owner metadata only. Persisted workflow
// facts (batch status + case disposition) shown verbatim; never a diagnosis, QC outcome, or
// sign-out signal. "No screening batches recorded" does NOT mean screening is unnecessary.
function ScreeningBatchBand({
  title,
  section,
  loading,
  onRetry,
  retrying,
  onOpen,
}: {
  title: string;
  section?: { status: SectionStatus; data: ScreeningBatchesSection | null; reason?: string };
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
  onOpen: () => void;
}) {
  const status = section?.status;
  const d = section?.data ?? null;
  const total = d?.total ?? 0;
  const badge =
    loading || !status ? 'Loading'
    : status === 'ready' ? `${total} batch${total === 1 ? '' : 'es'}`
    : status === 'empty' ? 'None recorded'
    : status === 'forbidden' ? 'No access'
    : status === 'error' ? 'Unavailable'
    : 'Not yet loaded';
  const statusLabel = (s: string) => (s === 'InScreening' ? 'In Screening' : s === 'QCSelected' ? 'QC Selected' : s);
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-52" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view screening batches." />
      ) : status === 'error' || !d ? (
        <EmptyState bare className="px-0 py-8" title="Unavailable" description={section?.reason ?? 'Screening batches could not be loaded.'} action={<Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={14} className="mr-1.5" />{retrying ? 'Retrying…' : 'Retry'}</Button>} />
      ) : status === 'empty' || d.items.length === 0 ? (
        <EmptyState bare className="px-0 py-6" title="No screening batches recorded" description="This case is not recorded in any cytotechnologist screening batch." />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-text">Screening batches</span>
            <Button variant="secondary" size="sm" onClick={onOpen}>Open Screening Batches <ExternalLink size={12} className="ml-1" /></Button>
          </div>
          <ul className="space-y-1.5">
            {d.items.map((m) => {
              const meta = [
                fmtDate(m.addedAt) !== '—' ? `added ${fmtDate(m.addedAt)}` : null,
                m.screenedAt ? `screened ${fmtDate(m.screenedAt)}` : null,
                m.completedAt ? `batch completed ${fmtDate(m.completedAt)}` : null,
              ].filter((v) => v && v !== '—');
              return (
                <li key={m.caseId} className="rounded border border-hairline px-2.5 py-1.5">
                  <div className="truncate text-sm text-text">
                    {dash(m.batchNumber)} <span className="text-text-tertiary">· {statusLabel(m.batchStatus)}</span>
                    <Badge tone="neutral" size="xs" className="ml-1.5">{statusLabel(m.disposition)}</Badge>
                  </div>
                  <div className="truncate text-meta text-text-tertiary">{meta.length ? meta.join(' · ') : 'Recorded membership'}</div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

function CollaborationBand({
  title,
  section,
  loading,
  onRetry,
  retrying,
  onOpenEscalations,
}: {
  title: string;
  section?: { status: SectionStatus; data: CollaborationSection | null; reason?: string };
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
  onOpenEscalations: () => void;
}) {
  const status = section?.status;
  const d = section?.data ?? null;
  const esc = d?.escalations;
  const total = esc?.total ?? 0;
  const badge = loading || !status ? 'Loading' : status === 'ready' ? `${total} escalation${total === 1 ? '' : 's'}` : status === 'empty' ? 'None recorded' : status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : 'Not yet loaded';
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-52" /><Skeleton shape="text" width="w-40" /></div>
      ) : !d || !esc ? (
        status === 'forbidden' ? (
          <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view collaboration activity." />
        ) : (
          <EmptyState bare className="px-0 py-8" title="Unavailable" description={section?.reason ?? 'Collaboration activity could not be loaded.'} action={<Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={14} className="mr-1.5" />{retrying ? 'Retrying…' : 'Retry'}</Button>} />
        )
      ) : esc.status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view escalations." />
      ) : esc.status === 'error' ? (
        <div className="flex items-center gap-3"><p className="text-meta text-text-tertiary">Escalations could not be loaded.</p><Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={12} className="mr-1" />{retrying ? 'Retrying…' : 'Retry'}</Button></div>
      ) : esc.status === 'empty' || esc.items.length === 0 ? (
        <EmptyState bare className="px-0 py-6" title="No escalations recorded" description="No escalations recorded for this case." />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-text">Escalations</span>
            <Button variant="secondary" size="sm" onClick={onOpenEscalations}>Open Escalations <ExternalLink size={12} className="ml-1" /></Button>
          </div>
          <ul className="space-y-1.5">
            {esc.items.map((e) => {
              const notif = e.physicianNotifiedAt ? `Notification recorded ${fmtDate(e.physicianNotifiedAt)}${e.physicianNotifiedVia ? ` (${e.physicianNotifiedVia})` : ''}` : null;
              const meta = [e.trigger, fmtDate(e.createdAt), e.assignedTo ? `assigned ${e.assignedTo}` : null, e.reviewedBy ? `reviewed by ${e.reviewedBy}` : null, notif, e.resolvedAt ? `resolved ${fmtDate(e.resolvedAt)}` : null].filter((v) => v && v !== '—');
              return (
                <li key={e.id} className="rounded border border-hairline px-2.5 py-1.5">
                  <div className="truncate text-sm text-text">{dash(e.severity)} <span className="text-text-tertiary">· {dash(e.status)}</span></div>
                  <div className="truncate text-meta text-text-tertiary">{meta.length ? meta.join(' · ') : 'Recorded escalation'}</div>
                </li>
              );
            })}
          </ul>
          {esc.items.length < total && <p className="mt-2 text-meta text-text-tertiary">Showing the first {esc.items.length} of {total} escalations.</p>}
        </>
      )}
    </Card>
  );
}

// Band 7: Reporting & Sign-Out (A11). Reporting METADATA only — result-sheet authorization/report/entry
// counts + amendment flags (derived from recorded events). Display-only: no authorize/amend/release/
// approve controls, no report prose/result content/narrative/diagnosis. Sign-Out is the authoritative
// workspace — the only action is a link to it. Never implies a finalized/correct/complete diagnosis.
function ReportingSignOutBand({
  title,
  section,
  loading,
  onRetry,
  retrying,
  onOpenSignOut,
}: {
  title: string;
  section?: { status: SectionStatus; data: ReportingSignOutSection | null; reason?: string };
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
  onOpenSignOut: () => void;
}) {
  const status = section?.status;
  const d = section?.data ?? null;
  const rs = d?.resultSheets;
  const total = rs?.total ?? 0;
  const badge = loading || !status ? 'Loading' : status === 'ready' ? `${total} result sheet${total === 1 ? '' : 's'}` : status === 'empty' ? 'None recorded' : status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : 'Not yet loaded';
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-52" /><Skeleton shape="text" width="w-40" /></div>
      ) : !d || !rs ? (
        status === 'forbidden' ? (
          <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view reporting." />
        ) : (
          <EmptyState bare className="px-0 py-8" title="Unavailable" description={section?.reason ?? 'Reporting could not be loaded.'} action={<Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={14} className="mr-1.5" />{retrying ? 'Retrying…' : 'Retry'}</Button>} />
        )
      ) : rs.status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view result sheets." />
      ) : rs.status === 'error' ? (
        <div className="flex items-center gap-3"><p className="text-meta text-text-tertiary">Reporting could not be loaded.</p><Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={12} className="mr-1" />{retrying ? 'Retrying…' : 'Retry'}</Button></div>
      ) : rs.status === 'empty' || rs.items.length === 0 ? (
        <EmptyState bare className="px-0 py-6" title="No result sheet recorded" description="No result sheet recorded for this case." action={<Button variant="secondary" size="sm" onClick={onOpenSignOut}>Open Sign-Out <ExternalLink size={12} className="ml-1" /></Button>} />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-text">Result sheets</span>
            <Button variant="secondary" size="sm" onClick={onOpenSignOut}>Open Sign-Out <ExternalLink size={12} className="ml-1" /></Button>
          </div>
          <ul className="space-y-1.5">
            {rs.items.map((s) => {
              const state = s.authorized ? 'Authorized' : 'Not authorized';
              const flags = [s.hasReport ? 'report recorded' : null, s.amended ? 'amended' : null, s.reauthorized ? 'reauthorized' : null, s.deauthorized ? 'de-authorized' : null, s.viewed ? 'viewed' : null].filter(Boolean);
              const meta = [`${s.entryCount} ${s.entryCount === 1 ? 'entry' : 'entries'}`, s.authorizedBy ? `by ${s.authorizedBy}` : null, fmtDate(s.authorizedAt), ...flags, `created ${fmtDate(s.createdAt)}`].filter((v) => v && v !== '—');
              return (
                <li key={s.id} className="rounded border border-hairline px-2.5 py-1.5">
                  <div className="truncate text-sm text-text">Result sheet <span className="text-text-tertiary">· {state}</span></div>
                  <div className="truncate text-meta text-text-tertiary">{meta.join(' · ')}</div>
                </li>
              );
            })}
          </ul>
          {rs.items.length < total && <p className="mt-2 text-meta text-text-tertiary">Showing the first {rs.items.length} of {total} result sheets.</p>}
          <p className="mt-2 text-meta text-text-tertiary">Reporting metadata only — authoring, authorization, and release happen in Sign-Out.</p>
        </>
      )}
    </Card>
  );
}

// Band 8: Timeline & Provenance (A12). ONE unified chronological list of recorded events from two
// authoritative persisted streams — record status changes and result-sheet events — each row carrying a
// visible source label. Metadata only: no notes, no report/result content, no diagnosis, no workflow
// controls (no authorize/amend/reverse/accept). Actorless events show a neutral "System". A per-row link
// opens the owner workspace conservatively (record status → the record; result-sheet → Sign-Out) — it does
// not claim to open a specific event. Retry appears for a technical error only.
const TIMELINE_SOURCE_LABEL: Record<string, string> = { 'record-status': 'Record status', 'result-sheet': 'Result sheet' };
function TimelineProvenanceBand({
  title,
  section,
  loading,
  onRetry,
  retrying,
  onOpen,
}: {
  title: string;
  section?: { status: SectionStatus; data: TimelineProvenanceSection | null; reason?: string };
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
  onOpen: (path: string) => void;
}) {
  const status = section?.status;
  const d = section?.data ?? null;
  const total = d?.total ?? 0;
  const badge = loading || !status ? 'Loading' : status === 'ready' ? `${total} event${total === 1 ? '' : 's'}` : status === 'empty' ? 'None recorded' : status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : 'Not yet loaded';
  // Unavailable event sources split by cause (technical vs access) — same presentation as the other
  // multi-source bands. Permission denials use the aggregate's "<code> required" reason convention.
  const failed = d ? d.unavailable.filter((u) => !/required$/.test(u.reason ?? '')).map((u) => u.label) : [];
  const restricted = d ? d.unavailable.filter((u) => /required$/.test(u.reason ?? '')).map((u) => u.label) : [];
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{badge}</Badge>
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-52" /><Skeleton shape="text" width="w-40" /></div>
      ) : !d ? (
        status === 'forbidden' ? (
          <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view this case's timeline." />
        ) : (
          <EmptyState bare className="px-0 py-8" title="Unavailable" description={section?.reason ?? 'The timeline could not be loaded.'} action={<Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={14} className="mr-1.5" />{retrying ? 'Retrying…' : 'Retry'}</Button>} />
        )
      ) : d.events.length === 0 && status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-8" title="No access" description="You do not have permission to view result-sheet events." />
      ) : d.events.length === 0 && status === 'error' ? (
        <div className="flex items-center gap-3"><p className="text-meta text-text-tertiary">Result-sheet events could not be loaded.</p><Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}><RotateCw size={12} className="mr-1" />{retrying ? 'Retrying…' : 'Retry'}</Button></div>
      ) : d.events.length === 0 ? (
        <EmptyState bare className="px-0 py-6" title="No recorded events" description="No recorded events for this case." />
      ) : (
        <>
          <ul className="space-y-1.5">
            {d.events.map((ev) => {
              const src = TIMELINE_SOURCE_LABEL[ev.source] ?? ev.source;
              const meta = [fmtDate(ev.occurredAt), ev.actor ?? 'System'].filter((v) => v && v !== '—');
              const openLabel = ev.source === 'result-sheet' ? 'Open Sign-Out' : 'Open record';
              return (
                <li key={ev.id} className="flex items-center justify-between gap-3 rounded border border-hairline px-2.5 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-text">{ev.eventType} <span className="text-text-tertiary">· {src}</span></div>
                    <div className="truncate text-meta text-text-tertiary">{meta.join(' · ')}</div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => onOpen(ev.ownerPath)}>{openLabel} <ExternalLink size={12} className="ml-1" /></Button>
                </li>
              );
            })}
          </ul>
          {d.truncated && <p className="mt-2 text-meta text-text-tertiary">Showing the first {d.events.length} of {total} events.</p>}
          {failed.length > 0 && <p className="mt-3 text-meta text-text-tertiary">Couldn’t load: {failed.join(', ')}.</p>}
          {restricted.length > 0 && <p className="mt-1 text-meta text-text-tertiary">Access restricted: {restricted.join(', ')}.</p>}
          <p className="mt-2 text-meta text-text-tertiary">Recorded events only — source-labeled and non-canonical. The owner systems remain authoritative.</p>
        </>
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
