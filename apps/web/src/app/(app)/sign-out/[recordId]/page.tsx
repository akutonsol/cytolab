'use client';

// Sign-Out Workspace — B2: read-only aggregate + hydrate the foundational regions
// (case, patient, clinical context, permission summary). All other regions remain
// visibly deferred. Orchestration only: no domain logic, no writes, no mock data.
// Contract: docs/PATHOS_SIGNOUT_IMPLEMENTATION_PLAN.md (Orchestration Rule, §3/§4/§4a).

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui';
import { ageFrom, type EffectivePermissions, type SectionStatus, type SignOutCaseAggregate } from '../types';

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

  const caseData = data?.case;
  const patient = data?.patient;
  const clinical = data?.clinicalContext;
  const perms = data?.permissions;

  return (
    <div className="w-full">
      <div className="mb-6">
        {backToWorklist}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Sign-Out</h1>
          <span className="font-mono text-sm text-text-secondary">
            {caseData?.status === 'ready' && caseData.data ? (caseData.data.labNumber ?? caseData.data.identifier) : `Case ${recordId}`}
          </span>
          {caseData?.status === 'ready' && caseData.data?.urgent && <Badge tone="danger" size="sm">Urgent</Badge>}
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
          {/* Foundational regions (hydrated in B2) */}
          <SectionCard title="Case" status={caseData?.status} loading={isLoading}>
            {caseData?.status === 'ready' && caseData.data && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Lab number" value={caseData.data.labNumber ?? caseData.data.identifier} />
                <Field label="Status" value={caseData.data.status} />
                <Field label="Form type" value={caseData.data.formType ?? '—'} />
                <Field label="Specimen" value={caseData.data.specimenTypes.join(', ') || '—'} />
                <Field label="Received" value={caseData.data.specimenDate ? new Date(caseData.data.specimenDate).toLocaleDateString() : '—'} />
                <Field label="Referring" value={caseData.data.doctor ?? '—'} />
              </dl>
            )}
          </SectionCard>

          <SectionCard title="Patient" status={patient?.status} loading={isLoading}>
            {patient?.status === 'ready' && patient.data && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Name" value={patient.data.name} />
                <Field label="Registration" value={patient.data.registrationNo ?? '—'} />
                <Field label="Sex" value={patient.data.gender ?? '—'} />
                <Field label="Age" value={data ? ageFrom(patient.data.dateOfBirth, data.asOf) ?? '—' : '—'} />
              </dl>
            )}
          </SectionCard>

          <SectionCard title="Clinical context" status={clinical?.status} loading={isLoading}>
            {clinical?.status === 'ready' && clinical.data && (
              <dl className="grid gap-y-3">
                <Field label="Clinical diagnosis" value={clinical.data.clinicalDiagnosis ?? 'Not recorded'} />
                <Field label="Clinical note" value={clinical.data.medicalEntry ?? 'Not recorded'} />
                <Field label="Structured features" value={[clinical.data.hasGynFeatures && 'Gynaecology', clinical.data.hasNonGynFeatures && 'Non-gynaecology'].filter(Boolean).join(', ') || 'None recorded'} />
              </dl>
            )}
          </SectionCard>

          <SectionCard title="Permission summary" status={perms?.status} loading={isLoading}>
            {perms?.status === 'ready' && perms.data && (
              <div className="flex flex-wrap gap-2">
                {PERMISSION_LABELS.map(({ key, label }) => (
                  <Badge key={key} tone={perms.data![key] ? 'success' : 'neutral'} size="sm">
                    {perms.data![key] ? '' : 'No '}
                    {label}
                  </Badge>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Deferred regions — truthful, distinct from loading and from empty data */}
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-meta uppercase tracking-wide text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-sm text-text">{value}</dd>
    </div>
  );
}
