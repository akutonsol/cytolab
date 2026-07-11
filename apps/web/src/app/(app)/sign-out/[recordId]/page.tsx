'use client';

// Sign-Out Workspace — B3: deepen the foundational context (case identity, patient
// summary, clinical context) from real data already returned by records.service.
// Orchestration only; no domain logic, no writes, no inference, no mock data. Age
// uses the canonical @/lib/age helper. Other regions remain visibly deferred.
// Contract: docs/PATHOS_SIGNOUT_IMPLEMENTATION_PLAN.md (Orchestration Rule, §3/§4).

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { deriveAge } from '@/lib/age';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui';
import type {
  AIEvidence,
  AttachmentMeta,
  BethesdaEvidence,
  CaseIdentity,
  CorrelationEvidence,
  EffectivePermissions,
  GynHistory,
  NonGynHistory,
  PriorEntry,
  SectionStatus,
  TimelineEvent,
  SignOutCaseAggregate,
  SlideMeta,
  Therapy,
} from '../types';

const NR = 'Not recorded';
const fmtDate = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleDateString() : NR);
const val = (s: string | null | undefined): string => (s && s.trim() ? s : NR);

const DEFERRED_REGIONS: { key: string; title: string; responsibility: string }[] = [
  { key: 'report', title: 'Result sheet & report', responsibility: 'The result sheet and report, edited in the existing editor.' },
];

const PERMISSION_LABELS: { key: keyof EffectivePermissions; label: string }[] = [
  { key: 'viewCase', label: 'View case' },
  { key: 'viewSlide', label: 'View slides' },
  { key: 'viewAI', label: 'View AI' },
  { key: 'viewBethesda', label: 'View Bethesda' },
  { key: 'viewCorrelation', label: 'View correlation' },
  { key: 'viewPriors', label: 'View priors' },
  { key: 'viewAttachments', label: 'View attachments' },
  { key: 'editResultSheet', label: 'Edit result sheet' },
  { key: 'authorize', label: 'Authorize / sign out' },
  { key: 'amend', label: 'Amend' },
];

export default function SignOutWorkspacePage() {
  const { recordId } = useParams<{ recordId: string }>();
  const router = useRouter();
  const { can, hydrated } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['signout-case', recordId],
    queryFn: () => api.get<SignOutCaseAggregate>(`/signout/case/${recordId}`).then((r) => r.data),
    enabled: hydrated && can('record:view'),
  });

  if (!hydrated) return null;

  const backToWorklist = (
    <Link
      href="/records"
      className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary"
    >
      <ArrowLeft size={15} /> Worklist
    </Link>
  );

  if (!can('record:view')) {
    return (
      <div className="w-full">
        {backToWorklist}
        <Card radius="md" elevation="soft" border="hairline" padding="none">
          <EmptyState bare className="px-6 py-12" title="No access to this case" description="You do not have permission to view records." />
        </Card>
      </div>
    );
  }

  const caseSec = data?.case;
  const patientSec = data?.patient;
  const clinicalSec = data?.clinicalContext;
  const permsSec = data?.permissions;
  const c = caseSec?.status === 'ready' ? caseSec.data : null;

  return (
    <div className="w-full">
      <div className="mb-6">
        {backToWorklist}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Sign-Out</h1>
          <span className="font-mono text-sm text-text-secondary">{c ? (c.labNumber ?? c.identifier) : `Case ${recordId}`}</span>
          {c?.urgent && <Badge tone="danger" size="sm">Urgent</Badge>}
        </div>
        <p className="mt-1 text-sm text-secondary">
          One workspace for reading, evidence, priors, reporting, and sign-out — composed from the
          existing PathOS surfaces around this case.
        </p>
      </div>

      {isError ? (
        <Card radius="md" elevation="soft" border="hairline" padding="lg" className="text-center">
          <p className="text-sm text-text-secondary">Couldn’t load this case.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Case, accession, specimen, referral, lifecycle */}
          <SectionCard title="Case" status={caseSec?.status} loading={isLoading}>
            {c && (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <Field label="Lab number" value={val(c.labNumber ?? c.identifier)} />
                  <Field label="Priority" value={c.urgent ? 'Urgent' : 'Routine'} />
                  <Field label="Lifecycle" value={c.status} sub={c.statusChangedAt ? `since ${fmtDate(c.statusChangedAt)}` : undefined} />
                  <Field label="Form type" value={val(c.formType)} />
                  <Field label="Specimen date" value={fmtDate(c.specimenDate)} />
                  <Field label="Received" value={fmtDate(c.receivedAt)} />
                </dl>
                <div>
                  <SubHeading>Referring / submitting source</SubHeading>
                  {c.referral ? (
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <Field label="Referring doctor" value={val(c.referral.doctor)} />
                      <Field label="Client" value={val(c.referral.clientName)} />
                      <Field label="Client type" value={val(c.referral.clientType)} />
                      <Field label="Account" value={val(c.referral.accountNo)} />
                    </dl>
                  ) : (
                    <p className="text-sm text-text-tertiary">{NR}</p>
                  )}
                </div>
                <div>
                  <SubHeading>Specimen & collection</SubHeading>
                  {c.specimens.length ? (
                    <div className="space-y-2">
                      {c.specimens.map((s, i) => (
                        <div key={i} className="rounded-lg border border-lightgray px-3 py-2 text-sm">
                          <span className="font-semibold text-text">{val(s.type)}</span>
                          {s.label ? <span className="text-text-secondary"> · {s.label}</span> : null}
                          <span className="ml-2 text-text-tertiary">
                            {[s.vialColour && `vial ${s.vialColour}`, s.bloodGroup && `blood ${s.bloodGroup}`, s.receivedAt && `received ${fmtDate(s.receivedAt)}`]
                              .filter(Boolean)
                              .join(' · ') || NR}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-text-tertiary">No specimen recorded</p>
                  )}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Patient demographics that are actually recorded */}
          <SectionCard title="Patient" status={patientSec?.status} loading={isLoading}>
            {patientSec?.status === 'ready' && patientSec.data && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Name" value={val(patientSec.data.name)} />
                <Field label="Registration" value={val(patientSec.data.registrationNo)} />
                <Field label="Sex" value={val(patientSec.data.gender)} />
                <Field label="Age" value={deriveAge(patientSec.data.dateOfBirth) != null ? `${deriveAge(patientSec.data.dateOfBirth)}y` : NR} />
                <Field label="Date of birth" value={fmtDate(patientSec.data.dateOfBirth)} />
              </dl>
            )}
          </SectionCard>

          {/* Reason for test, clinical history, therapy — recorded only */}
          <SectionCard title="Clinical context" status={clinicalSec?.status} loading={isLoading}>
            {clinicalSec?.status === 'ready' && clinicalSec.data && (
              <div className="space-y-4">
                <dl className="grid gap-y-3">
                  <Field label="Reason for test / clinical diagnosis" value={val(clinicalSec.data.reason)} />
                  <Field label="Clinical note" value={val(clinicalSec.data.note)} />
                </dl>
                <div>
                  <SubHeading>Prior therapy</SubHeading>
                  <p className="text-sm text-text">{therapyText(clinicalSec.data.therapy)}</p>
                </div>
                <div>
                  <SubHeading>Clinical history</SubHeading>
                  <ClinicalHistory gyn={clinicalSec.data.gyn} nonGyn={clinicalSec.data.nonGyn} />
                </div>
              </div>
            )}
          </SectionCard>

          {/* Effective permissions (descriptive) */}
          <SectionCard title="Permission summary" status={permsSec?.status} loading={isLoading}>
            {permsSec?.status === 'ready' && permsSec.data && (
              <div className="flex flex-wrap gap-2">
                {PERMISSION_LABELS.map(({ key, label }) => (
                  <Badge key={key} tone={permsSec.data![key] ? 'success' : 'neutral'} size="sm">
                    {permsSec.data![key] ? '' : 'No '}
                    {label}
                  </Badge>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Digital slides & WSI — real metadata + a path into the existing viewer.
              The viewer owns image delivery; this only lists and links. */}
          <SlidesPanel section={data?.slides} loading={isLoading} onOpen={(path) => router.push(path)} />

          {/* Diagnostic evidence already recorded for this case. Read-only projections of
              the AI-screening, Bethesda, and correlation owners. Evidence leads; recorded
              model confidence is shown only as secondary context. */}
          <AIEvidencePanel section={data?.ai} loading={isLoading} />
          <BethesdaEvidencePanel section={data?.bethesda} loading={isLoading} />
          <CorrelationEvidencePanel section={data?.correlation} loading={isLoading} onOpen={(path) => router.push(path)} />

          {/* Prior-aware review — real patient-linked priors. The current case is shown
              distinctly at the top; priors never override it. Read-only, no trend. */}
          <PriorsPanel
            section={data?.priors}
            loading={isLoading}
            current={data?.case?.status === 'ready' ? data.case.data : null}
            onOpen={(path) => router.push(path)}
          />

          {/* Attachments — real recorded metadata only (never file bytes). The file owner
              serves the files; this lists them and opens the record's owner surface. */}
          <AttachmentsPanel
            section={data?.attachments}
            loading={isLoading}
            onOpenRecord={() => router.push(`/records/${recordId}`)}
          />

          {/* Unified timeline — recorded events only, chronological, source-labelled. */}
          <TimelinePanel section={data?.timeline} loading={isLoading} onOpen={(path) => router.push(path)} />

          {/* Deferred regions — truthful, distinct from loading and empty data */}
          {DEFERRED_REGIONS.map((r) => (
            <Card key={r.key} radius="md" elevation="soft" border="hairline" padding="lg">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-text">{r.title}</h2>
                <Badge tone="neutral" size="xs">Deferred</Badge>
              </div>
              <EmptyState bare className="px-0 py-8" title="Not yet in this workspace" description={r.responsibility} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function therapyText(t: Therapy | null): string {
  if (!t) return NR;
  const flags = [t.hormone && 'Hormone', t.radiation && 'Radiation', t.surgical && 'Surgical'].filter(Boolean) as string[];
  const parts = [...flags, t.other?.trim()].filter(Boolean) as string[];
  return parts.length ? parts.join(', ') : 'None recorded';
}

function ClinicalHistory({ gyn, nonGyn }: { gyn: GynHistory | null; nonGyn: NonGynHistory | null }) {
  const items: { label: string; value: string }[] = [];
  if (gyn) {
    if (gyn.routineCheck) items.push({ label: 'Routine check', value: 'Yes' });
    if (gyn.previousCytology) items.push({ label: 'Previous cytology', value: 'Yes' });
    if (gyn.lmp) items.push({ label: 'LMP', value: fmtDate(gyn.lmp) });
    if (gyn.pregnant) items.push({ label: 'Pregnant', value: gyn.pregnancies != null ? `Yes (${gyn.pregnancies})` : 'Yes' });
    if (gyn.menopause) items.push({ label: 'Menopause', value: gyn.dateOfMenopause ? fmtDate(gyn.dateOfMenopause) : 'Yes' });
    if (gyn.cervixAppearance) items.push({ label: 'Cervix appearance', value: gyn.cervixAppearance });
    if (gyn.pelvicAbnormalities) items.push({ label: 'Pelvic abnormalities', value: gyn.pelvicAbnormalities });
    if (gyn.leucorrhea) items.push({ label: 'Leucorrhea', value: gyn.leucorrhea });
    if (gyn.lengthOfCycle) items.push({ label: 'Cycle length', value: gyn.lengthOfCycle });
  }
  if (nonGyn) {
    if (nonGyn.sampleDescription) items.push({ label: 'Sample description', value: nonGyn.sampleDescription });
    if (nonGyn.natureAndSource) items.push({ label: 'Nature & source', value: nonGyn.natureAndSource });
  }
  if (!gyn && !nonGyn) return <p className="text-sm text-text-tertiary">{NR}</p>;
  if (!items.length) return <p className="text-sm text-text-tertiary">None recorded</p>;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      {items.map((it) => (
        <Field key={it.label} label={it.label} value={it.value} />
      ))}
    </dl>
  );
}

function fmtSize(bytes: number | null): string | null {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SlidesPanel({
  section,
  loading,
  onOpen,
}: {
  section?: SignOutCaseAggregate['slides'];
  loading: boolean;
  onOpen: (viewerPath: string) => void;
}) {
  const status = section?.status;
  const count = status === 'ready' && section?.data ? section.data.count : 0;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">Digital slides &amp; WSI</h2>
        {status === 'ready' && <Badge tone="neutral" size="xs">{count} slide{count === 1 ? '' : 's'}</Badge>}
      </div>
      {loading || !status ? (
        <div className="space-y-2">
          <Skeleton shape="text" width="w-48" />
          <Skeleton shape="text" width="w-40" />
        </div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-6" title="No access" description="You do not have permission to view slides." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="Slide metadata could not be loaded." />
      ) : status === 'empty' || !section?.data?.items.length ? (
        <EmptyState bare className="px-0 py-6" title="No digital slides" description="No slides have been uploaded for this case." />
      ) : (
        <div className="space-y-2">
          {section.data.items.map((s) => (
            <SlideRow key={s.id} slide={s} onOpen={() => onOpen(s.viewerPath)} />
          ))}
        </div>
      )}
    </Card>
  );
}

function SlideRow({ slide, onOpen }: { slide: SlideMeta; onOpen: () => void }) {
  const identity =
    [slide.stain, slide.magnification, slide.scanner, slide.format && slide.format !== 'image' ? slide.format : null]
      .filter(Boolean)
      .join(' · ') || 'Slide';
  const size = fmtSize(slide.fileSizeBytes);
  const uploaded = slide.uploadedAt ? `Uploaded ${new Date(slide.uploadedAt).toLocaleDateString()}` : 'Upload date not recorded';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-lightgray px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-text">{identity}</div>
        <div className="text-meta text-text-tertiary">{[uploaded, size].filter(Boolean).join(' · ')}</div>
      </div>
      <Button variant="secondary" size="sm" onClick={onOpen}>Open in viewer</Button>
    </div>
  );
}

// Shared shell for the diagnostic-evidence panels: one status contract, one set of
// truthful non-ready states. `emptyDescription` names what "empty" means for the owner.
function EvidenceCard({
  title,
  badge,
  status,
  loading,
  emptyTitle,
  emptyDescription,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  status?: SectionStatus;
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  children?: React.ReactNode;
}) {
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        {status === 'ready' && badge}
      </div>
      {loading || !status ? (
        <div className="space-y-2">
          <Skeleton shape="text" width="w-48" />
          <Skeleton shape="text" width="w-40" />
        </div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-6" title="No access" description="You do not have permission to view this evidence." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="This evidence could not be loaded." />
      ) : status === 'empty' ? (
        <EmptyState bare className="px-0 py-6" title={emptyTitle} description={emptyDescription} />
      ) : (
        children
      )}
    </Card>
  );
}

const aiStatusTone = (s: string): 'success' | 'danger' | 'neutral' =>
  s === 'Completed' ? 'success' : s === 'Failed' ? 'danger' : 'neutral';

// AI screening — evidence first (primary finding, then recorded regions), with recorded
// model confidence and the recorded review outcome shown only as secondary context.
// Nothing here is a diagnosis, a recommendation, or a quantification claim.
function AIEvidencePanel({ section, loading }: { section?: SignOutCaseAggregate['ai']; loading: boolean }) {
  const d = section?.status === 'ready' ? section.data : null;
  return (
    <EvidenceCard
      title="AI screening"
      status={section?.status}
      loading={loading}
      emptyTitle="No AI screening"
      emptyDescription="No AI screening result has been recorded for this case."
      badge={d ? <Badge tone={aiStatusTone(d.status)} size="xs">{d.status}</Badge> : null}
    >
      {d && (
        <div className="space-y-4">
          <div>
            <SubHeading>Primary finding</SubHeading>
            <p className="text-sm text-text">{val(d.primaryFinding)}</p>
          </div>
          <div>
            <SubHeading>Flagged regions{d.regions.length ? ` (${d.regions.length})` : ''}</SubHeading>
            {d.regions.length ? (
              <ul className="space-y-1.5">
                {d.regions.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-lightgray px-3 py-2">
                    <span className="text-sm text-text">
                      <span className="font-semibold">{val(r.region)}</span>
                      {r.finding ? <span className="text-text-secondary"> — {r.finding}</span> : null}
                    </span>
                    {r.confidence != null && (
                      <span className="text-meta text-text-tertiary">confidence {Math.round(r.confidence)}%</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-tertiary">{d.flaggedAreas > 0 ? `${d.flaggedAreas} flagged` : 'None recorded'}</p>
            )}
          </div>
          {(d.confidence != null || d.confidenceLevel) && (
            <p className="text-meta text-text-tertiary">
              Recorded model confidence:{' '}
              {d.confidence != null ? `${Math.round(d.confidence)}%` : '—'}
              {d.confidenceLevel ? ` (${d.confidenceLevel})` : ''}
            </p>
          )}
          <div>
            <SubHeading>Pathologist review</SubHeading>
            {d.reviewedAt ? (
              <p className="text-sm text-text">
                {d.agreedWithAI == null ? 'Reviewed' : d.agreedWithAI ? 'Agreed with AI' : 'Disagreed with AI'}
                {d.reviewerName ? ` · ${d.reviewerName}` : ''} · {fmtDate(d.reviewedAt)}
                {d.pathologistNote ? <span className="mt-1 block text-text-secondary">{d.pathologistNote}</span> : null}
              </p>
            ) : (
              <p className="text-sm text-text-tertiary">Not yet reviewed</p>
            )}
          </div>
          {d.processedAt && <p className="text-meta text-text-tertiary">Screened {fmtDate(d.processedAt)}</p>}
        </div>
      )}
    </EvidenceCard>
  );
}

// Bethesda — the owner's recorded TBS classification, stored narrative, and reporter.
// shortCode is the owner's deterministic mapping of stored fields, never inferred here.
function BethesdaEvidencePanel({ section, loading }: { section?: SignOutCaseAggregate['bethesda']; loading: boolean }) {
  const d = section?.status === 'ready' ? section.data : null;
  const interpretation = d ? bethesdaInterpretation(d) : [];
  return (
    <EvidenceCard
      title="Bethesda classification"
      status={section?.status}
      loading={loading}
      emptyTitle="No Bethesda result"
      emptyDescription="No Bethesda classification has been recorded for this case."
      badge={d?.shortCode ? <Badge tone="neutral" size="xs">{d.shortCode}</Badge> : null}
    >
      {d && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Specimen adequacy" value={val(d.specimenAdequacy)} />
            {d.unsatisfactoryReason ? <Field label="Adequacy reason" value={d.unsatisfactoryReason} /> : null}
            {d.generalCategory ? <Field label="General category" value={d.generalCategory} /> : null}
            {d.hpvResult ? <Field label="HPV" value={d.hpvGenotype ? `${d.hpvResult} (${d.hpvGenotype})` : d.hpvResult} /> : null}
          </dl>
          {interpretation.length > 0 && (
            <div>
              <SubHeading>Interpretation / result</SubHeading>
              <ul className="list-disc space-y-1 pl-5 text-sm text-text">
                {interpretation.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
          {(d.organisms.length > 0 || d.otherNonNeoplastic.length > 0) && (
            <div>
              <SubHeading>Additional findings</SubHeading>
              <p className="text-sm text-text">{[...d.organisms, ...d.otherNonNeoplastic].join(', ')}</p>
            </div>
          )}
          {d.recommendation && (
            <div>
              <SubHeading>Recommendation</SubHeading>
              <p className="text-sm text-text">{d.recommendation}{d.recommendationNotes ? ` — ${d.recommendationNotes}` : ''}</p>
            </div>
          )}
          {d.narrative && (
            <div>
              <SubHeading>Recorded narrative</SubHeading>
              <p className="whitespace-pre-wrap text-sm text-text-secondary">{d.narrative}</p>
            </div>
          )}
          <p className="text-meta text-text-tertiary">
            {d.reporterName ? `Reported by ${d.reporterName}` : 'Reporter not recorded'}
            {d.reportedAt ? ` · ${fmtDate(d.reportedAt)}` : ''}
          </p>
        </div>
      )}
    </EvidenceCard>
  );
}

function bethesdaInterpretation(d: BethesdaEvidence): string[] {
  const out: string[] = [];
  if (d.squamousCategory) out.push(d.ascSubtype ? `${d.squamousCategory} (${d.ascSubtype})` : d.squamousCategory);
  if (d.glandularCategory) out.push(d.glandularSubtype ? `${d.glandularCategory} — ${d.glandularSubtype}` : d.glandularCategory);
  if (d.otherMalignancy) out.push(d.otherMalignancy);
  return out;
}

const correlationTone = (r: string | null): 'success' | 'danger' | 'neutral' =>
  r === 'Concordant' ? 'success' : r === 'MajorDiscordant' ? 'danger' : 'neutral';
const correlationLabel = (r: string | null): string =>
  r === 'MinorDiscordant' ? 'Minor discordant' : r === 'MajorDiscordant' ? 'Major discordant' : r || 'Unresolved';

// Cytology–histology correlation — stored relationship only. Discordance is displayed
// solely when the stored correlationResult carries it; nothing is inferred, and no
// quality alert is manufactured here. Opens the existing correlation surface per case.
function CorrelationEvidencePanel({
  section,
  loading,
  onOpen,
}: {
  section?: SignOutCaseAggregate['correlation'];
  loading: boolean;
  onOpen: (ownerPath: string) => void;
}) {
  const data = section?.status === 'ready' ? section.data : null;
  return (
    <EvidenceCard
      title="Cytology–histology correlation"
      status={section?.status}
      loading={loading}
      emptyTitle="No correlation"
      emptyDescription="No cytology–histology correlation has been recorded for this case."
      badge={data ? <Badge tone="neutral" size="xs">{data.count} case{data.count === 1 ? '' : 's'}</Badge> : null}
    >
      {data && (
        <div className="space-y-2">
          {data.items.map((c) => <CorrelationRow key={c.id} c={c} onOpen={() => onOpen(c.ownerPath)} />)}
        </div>
      )}
    </EvidenceCard>
  );
}

function CorrelationRow({ c, onOpen }: { c: CorrelationEvidence; onOpen: () => void }) {
  return (
    <div className="rounded-lg border border-lightgray px-3 py-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={correlationTone(c.correlationResult)} size="xs">{correlationLabel(c.correlationResult)}</Badge>
          {c.reviewRequired && !c.reviewedAt && <Badge tone="danger" size="xs">Review required</Badge>}
        </div>
        <Button variant="secondary" size="sm" onClick={onOpen}>Open correlation</Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
        <Field label="Cytology" value={val(c.cytologyDiagnosis)} sub={c.cytologyDate ? fmtDate(c.cytologyDate) : undefined} />
        <Field
          label={`Histology${c.histologySource && c.histologySource !== 'Internal' ? ` (${c.histologySource})` : ''}`}
          value={val(c.histologyDiagnosis)}
          sub={c.histologyDate ? fmtDate(c.histologyDate) : undefined}
        />
      </dl>
      {c.discordanceReason && (
        <p className="mt-2 text-sm text-text-secondary"><span className="font-semibold text-text">Discordance:</span> {c.discordanceReason}</p>
      )}
      {c.reviewedAt && (
        <p className="mt-1.5 text-meta text-text-tertiary">
          Reviewed {c.reviewerName ? `by ${c.reviewerName} ` : ''}· {fmtDate(c.reviewedAt)}
          {c.reviewNotes ? ` — ${c.reviewNotes}` : ''}
        </p>
      )}
    </div>
  );
}

const priorTone = (r: string | null): 'success' | 'danger' | 'neutral' =>
  r === 'Concordant' ? 'success' : r === 'MajorDiscordant' ? 'danger' : 'neutral';

// Prior-aware review. The current case sits distinctly at the top (primary-tinted, "Current"
// badge); priors are read-only rows below. Result summaries are stored values only — no
// trend, progression, or longitudinal conclusion is drawn.
function PriorsPanel({
  section,
  loading,
  current,
  onOpen,
}: {
  section?: SignOutCaseAggregate['priors'];
  loading: boolean;
  current: CaseIdentity | null;
  onOpen: (ownerPath: string) => void;
}) {
  const status = section?.status;
  const data = status === 'ready' ? section?.data : null;
  const degraded = data?.sources
    ? [data.sources.records === 'error' && 'prior cases', data.sources.correlation === 'error' && 'correlation history'].filter(Boolean)
    : [];
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">Prior history</h2>
        {status === 'ready' && <Badge tone="neutral" size="xs">{data?.count} prior{data?.count === 1 ? '' : 's'}</Badge>}
      </div>

      {/* Current case — always distinct from priors, never overridden by them. */}
      {current && (
        <div className="mb-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5">
          <div className="mb-1 flex items-center gap-2">
            <Badge tone="primary" size="xs">Current case</Badge>
            <span className="text-sm font-semibold text-text">{current.labNumber ?? current.identifier}</span>
          </div>
          <div className="text-meta text-text-tertiary">
            {[current.formType, current.status, current.specimenDate ? fmtDate(current.specimenDate) : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      )}

      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-6" title="No access" description="You do not have permission to view prior history." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="Prior history could not be loaded." />
      ) : status === 'empty' || !data?.items.length ? (
        <EmptyState bare className="px-0 py-6" title="No prior history" description="No other records or correlation cases are recorded for this patient." />
      ) : (
        <div className="space-y-2">
          {degraded.length > 0 && (
            <p className="text-meta text-text-tertiary">Some sources unavailable: {degraded.join(', ')}.</p>
          )}
          {data.items.map((pr) => <PriorRow key={`${pr.source}-${pr.id}`} pr={pr} onOpen={() => onOpen(pr.ownerPath)} />)}
          {data.truncated && (
            <p className="pt-1 text-meta text-text-tertiary">Showing the 25 most recent prior entries.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function PriorRow({ pr, onOpen }: { pr: PriorEntry; onOpen: () => void }) {
  const meta = [
    pr.date ? fmtDate(pr.date) : null,
    pr.sourceType,
    pr.formType && pr.formType !== pr.sourceType ? pr.formType : null,
    pr.status,
  ].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-lightgray px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-text">{val(pr.identity)}</span>
          {pr.resultSummary && <Badge tone={pr.source === 'correlation' ? priorTone(pr.resultSummary) : 'neutral'} size="xs">{pr.resultSummary}</Badge>}
          {pr.amended && <Badge tone="danger" size="xs">Amended</Badge>}
          {pr.hasReport && <Badge tone="neutral" size="xs">Report</Badge>}
        </div>
        <div className="mt-0.5 text-meta text-text-tertiary">{meta}</div>
        {pr.authorizedAt && <div className="text-meta text-text-tertiary">Authorized {fmtDate(pr.authorizedAt)}</div>}
      </div>
      <Button variant="secondary" size="sm" onClick={onOpen}>Open</Button>
    </div>
  );
}

// Short display label for a stored mime type — formatting only, never content inference.
function fileTypeLabel(kind: string | null): string {
  if (!kind) return 'File';
  if (kind.includes('pdf')) return 'PDF';
  if (kind.startsWith('image/')) return (kind.split('/')[1] || 'image').toUpperCase();
  if (kind.includes('word') || kind.includes('msword')) return 'Word';
  return kind;
}

// Attachments — read-only metadata list (never file bytes). One real action opens the
// record's owner surface, where the existing, unchanged downloader serves the files.
function AttachmentsPanel({
  section,
  loading,
  onOpenRecord,
}: {
  section?: SignOutCaseAggregate['attachments'];
  loading: boolean;
  onOpenRecord: () => void;
}) {
  const status = section?.status;
  const data = status === 'ready' ? section?.data : null;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">Attachments</h2>
        {status === 'ready' && <Badge tone="neutral" size="xs">{data?.count} file{data?.count === 1 ? '' : 's'}</Badge>}
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-6" title="No access" description="You do not have permission to view attachments." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="Attachments could not be loaded." />
      ) : status === 'empty' || !data?.items.length ? (
        <EmptyState bare className="px-0 py-6" title="No attachments" description="No files are attached to this case." />
      ) : (
        <div className="space-y-2">
          {data.items.map((a) => <AttachmentRow key={a.id} a={a} />)}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-meta text-text-tertiary">Files are downloaded from the record.</p>
            <Button variant="secondary" size="sm" onClick={onOpenRecord}>Open in record</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AttachmentRow({ a }: { a: AttachmentMeta }) {
  const meta = [fileTypeLabel(a.kind), a.uploadedAt ? `Uploaded ${fmtDate(a.uploadedAt)}` : null].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-lightgray px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-text">{a.filename ?? 'Unnamed file'}</div>
        <div className="text-meta text-text-tertiary">{meta}</div>
      </div>
    </div>
  );
}

const fmtDateTime = (iso: string): string => {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

// Unified timeline — recorded events only, in the server's chronological order (never
// reordered here). Each row shows its source and a factual description; a missing actor
// is stated honestly. No summaries, milestones, or reconstructed narrative.
function TimelinePanel({
  section,
  loading,
  onOpen,
}: {
  section?: SignOutCaseAggregate['timeline'];
  loading: boolean;
  onOpen: (ownerPath: string) => void;
}) {
  const status = section?.status;
  const data = status === 'ready' ? section?.data : null;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">Case timeline</h2>
        {status === 'ready' && <Badge tone="neutral" size="xs">{data?.count} event{data?.count === 1 ? '' : 's'}</Badge>}
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-6" title="No access" description="You do not have permission to view this timeline." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="The timeline could not be loaded." />
      ) : status === 'empty' || !data?.items.length ? (
        <EmptyState bare className="px-0 py-6" title="No recorded events" description="No timestamped events are recorded for this case." />
      ) : (
        <div>
          {data.unavailable.length > 0 && (
            <p className="mb-2 text-meta text-text-tertiary">Some sources unavailable: {data.unavailable.join(', ')}.</p>
          )}
          <ol className="space-y-2">
            {data.items.map((e) => <TimelineRow key={e.id} e={e} onOpen={e.ownerPath ? () => onOpen(e.ownerPath!) : undefined} />)}
          </ol>
        </div>
      )}
    </Card>
  );
}

function TimelineRow({ e, onOpen }: { e: TimelineEvent; onOpen?: () => void }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-lightgray px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-text">{e.description}</div>
        <div className="mt-0.5 text-meta text-text-tertiary">
          {fmtDateTime(e.timestamp)} · {e.source} · {e.actor ?? 'Actor not recorded'}
        </div>
      </div>
      {onOpen && <Button variant="secondary" size="sm" onClick={onOpen}>Open</Button>}
    </li>
  );
}

function SectionCard({
  title,
  status,
  loading,
  children,
}: {
  title: string;
  status?: SectionStatus;
  loading: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <h2 className="mb-3 text-base font-bold text-text">{title}</h2>
      {loading || !status ? (
        <div className="space-y-2">
          <Skeleton shape="text" width="w-40" />
          <Skeleton shape="text" width="w-56" />
        </div>
      ) : status === 'ready' ? (
        children
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-6" title="No access" description="You do not have permission for this section." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="This section could not be loaded." />
      ) : (
        <EmptyState bare className="px-0 py-6" title="Nothing recorded" description="No data for this section." />
      )}
    </Card>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-meta font-semibold uppercase tracking-wide text-text-tertiary">{children}</div>;
}

function Field({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-meta uppercase tracking-wide text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-sm text-text">
        {value}
        {sub ? <span className="ml-1 text-text-tertiary">· {sub}</span> : null}
      </dd>
    </div>
  );
}
