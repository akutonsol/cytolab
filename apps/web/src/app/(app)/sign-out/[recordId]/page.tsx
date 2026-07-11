'use client';

// Sign-Out Workspace — B3: deepen the foundational context (case identity, patient
// summary, clinical context) from real data already returned by records.service.
// Orchestration only; no domain logic, no writes, no inference, no mock data. Age
// uses the canonical @/lib/age helper. Other regions remain visibly deferred.
// Contract: docs/PATHOS_SIGNOUT_IMPLEMENTATION_PLAN.md (Orchestration Rule, §3/§4).

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { deriveAge } from '@/lib/age';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui';
import type {
  EffectivePermissions,
  GynHistory,
  NonGynHistory,
  SectionStatus,
  SignOutCaseAggregate,
  Therapy,
} from '../types';

const NR = 'Not recorded';
const fmtDate = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleDateString() : NR);
const val = (s: string | null | undefined): string => (s && s.trim() ? s : NR);

const DEFERRED_REGIONS: { key: string; title: string; responsibility: string }[] = [
  { key: 'slides', title: 'Digital slides & WSI', responsibility: 'Digital slides and the existing whole-slide viewer.' },
  { key: 'evidence', title: 'AI findings, Bethesda & correlation', responsibility: 'Real AI findings and regions, Bethesda, and correlation.' },
  { key: 'priors', title: 'Prior cases & reports', responsibility: 'Prior cases and prior reports for this patient.' },
  { key: 'attachments', title: 'Attachments', responsibility: 'Supporting documents for this case.' },
  { key: 'report', title: 'Result sheet & report', responsibility: 'The result sheet and report, edited in the existing editor.' },
  { key: 'timeline', title: 'Case timeline', responsibility: 'A unified timeline assembled from recorded events.' },
];

const PERMISSION_LABELS: { key: keyof EffectivePermissions; label: string }[] = [
  { key: 'viewCase', label: 'View case' },
  { key: 'viewSlide', label: 'View slides' },
  { key: 'viewAI', label: 'View AI' },
  { key: 'viewBethesda', label: 'View Bethesda' },
  { key: 'viewPriors', label: 'View priors' },
  { key: 'viewAttachments', label: 'View attachments' },
  { key: 'editResultSheet', label: 'Edit result sheet' },
  { key: 'authorize', label: 'Authorize / sign out' },
  { key: 'amend', label: 'Amend' },
];

export default function SignOutWorkspacePage() {
  const { recordId } = useParams<{ recordId: string }>();
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
