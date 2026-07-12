'use client';

// Enterprise Administration & Controls Workspace — A2: connect the shell to the read-only
// aggregate (GET /enterprise-administration/overview) and freeze the section-status contract.
// A2 renders ONLY the descriptive permission map (`permissionMatrix` → ready); the other 21
// sections stay truthfully `deferred`. NO owner data, NO configuration values, NO counters/KPIs,
// NO secrets, NO mutations/forms/modals. Each section resolves independently so a future failure
// isolates to it and never collapses the permission map, siblings, or the shell.
// Contract: docs/PATHOS_ENTERPRISE_ADMINISTRATION_IMPLEMENTATION_PLAN.md (§1, §3, §4, §5, §8).

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui';
import type { EffectiveAdminPermissions, EnterpriseAdminOverview, SectionStatus } from './types';

// Only an internal, same-origin path may be a return target — reject external and
// protocol-relative URLs (open-redirect protection). Mirrors the Sign-Out / Quality guard.
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

// The approved administration sections, in the exact order of the implementation plan §5.
// `key` matches the aggregate section key; `permissionMatrix` renders the descriptive map (ready
// at A2), every other section renders its truthful status (deferred at A2). `responsibility` is a
// case-neutral description of what the section WILL compose — never a value, count, or status.
type SectionKey = keyof Omit<EnterpriseAdminOverview, 'asOf'>;
const ADMIN_SECTIONS: { key: SectionKey; title: string; responsibility: string }[] = [
  { key: 'laboratory', title: 'Laboratory', responsibility: 'Recorded laboratory profile and operating preferences.' },
  { key: 'branding', title: 'Branding', responsibility: 'Recorded branding and logo configuration.' },
  { key: 'departments', title: 'Departments', responsibility: 'The recorded departments.' },
  { key: 'users', title: 'Users', responsibility: 'The user directory and each user’s assigned roles.' },
  { key: 'roles', title: 'Roles', responsibility: 'The recorded roles.' },
  { key: 'permissions', title: 'Permissions', responsibility: 'The descriptive role-to-permission map.' },
  { key: 'security', title: 'Security', responsibility: 'Security posture: sessions, login history, MFA coverage, locks, alerts, password policy.' },
  { key: 'clients', title: 'Clients', responsibility: 'The client directory.' },
  { key: 'labCodes', title: 'Lab Codes', responsibility: 'The lab-code catalog.' },
  { key: 'codeSheets', title: 'Code Sheets', responsibility: 'The recorded code-sheet configuration.' },
  { key: 'forms', title: 'Forms', responsibility: 'The recorded form configuration.' },
  { key: 'fhir', title: 'FHIR', responsibility: 'Configured FHIR endpoints and transmission health (never secrets).' },
  { key: 'notifications', title: 'Notifications', responsibility: 'The recorded notification preferences.' },
  { key: 'billing', title: 'Billing', responsibility: 'The recorded billing configuration.' },
  { key: 'services', title: 'Services', responsibility: 'The services and pricing catalog.' },
  { key: 'taxes', title: 'Taxes', responsibility: 'The recorded tax configuration.' },
  { key: 'featureFlags', title: 'Feature Flags', responsibility: 'Enabled modules and feature flags.' },
  { key: 'systemHealth', title: 'System Health', responsibility: 'System health and maintenance status.' },
  { key: 'aiSettings', title: 'AI Settings', responsibility: 'The recorded AI reporting settings.' },
  { key: 'portalAccess', title: 'Portal Access', responsibility: 'Client portal access status.' },
  { key: 'lifecycle', title: 'Lifecycle Observation', responsibility: 'The recorded record-status history — observation only.' },
  { key: 'permissionMatrix', title: 'Permission Matrix', responsibility: 'The descriptive permission map for the current user.' },
];

// Descriptive permission map labels. These render only which owner permissions the caller holds
// (permission-aware presentation) — never a configuration value. Order mirrors the admin domains.
const PERMISSION_LABELS: { key: keyof EffectiveAdminPermissions; label: string }[] = [
  { key: 'viewRecord', label: 'View records' },
  { key: 'viewRecordStatus', label: 'View record status' },
  { key: 'changeRecordStatus', label: 'Change record status' },
  { key: 'viewLabConfig', label: 'View lab configuration' },
  { key: 'changeLabConfig', label: 'Change lab configuration' },
  { key: 'viewDepartment', label: 'View departments' },
  { key: 'changeDepartment', label: 'Change departments' },
  { key: 'viewUser', label: 'View users' },
  { key: 'changeUser', label: 'Change users' },
  { key: 'viewRole', label: 'View roles' },
  { key: 'changeRole', label: 'Change roles' },
  { key: 'viewPermission', label: 'View permissions' },
  { key: 'viewClient', label: 'View clients' },
  { key: 'changeClient', label: 'Change clients' },
  { key: 'viewLabCode', label: 'View lab codes' },
  { key: 'changeLabCode', label: 'Change lab codes' },
  { key: 'viewCodeSheet', label: 'View code sheets' },
  { key: 'changeCodeSheet', label: 'Change code sheets' },
  { key: 'viewFormConfig', label: 'View form config' },
  { key: 'manageFormConfig', label: 'Manage form config' },
  { key: 'systemSecurity', label: 'Security governance' },
  { key: 'systemHealth', label: 'System health' },
  { key: 'viewService', label: 'View services' },
  { key: 'changeService', label: 'Change services' },
  { key: 'viewTax', label: 'View taxes' },
  { key: 'changeTax', label: 'Change taxes' },
  { key: 'viewNotification', label: 'View notifications' },
  { key: 'viewPortalUser', label: 'View portal access' },
  { key: 'changePortalUser', label: 'Change portal access' },
  { key: 'viewChangeRequest', label: 'View change requests' },
  { key: 'changeChangeRequest', label: 'Change change requests' },
  { key: 'featureFlags', label: 'Feature flags (superuser)' },
];

export default function EnterpriseAdministrationWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, hydrated } = useAuth();
  const returnTo = safeReturnTo(searchParams.get('returnTo')) ?? '/records';
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedOnce = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ['enterprise-admin-overview'],
    queryFn: () => api.get<EnterpriseAdminOverview>('/enterprise-administration/overview').then((r) => r.data),
    enabled: hydrated && can('record:view'),
  });

  // Move focus to the workspace heading once on direct entry (accessibility). The aggregate
  // refetch never re-runs this (guarded by focusedOnce), so it cannot steal focus.
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

  // Entry gate only (the aggregate base gate, plan §3). Owner endpoints remain the enforcement
  // authority for each section once they hydrate in later checkpoints.
  if (!can('record:view')) {
    return (
      <div className="w-full">
        {backToWorklist}
        <Card radius="md" elevation="soft" border="hairline" padding="none">
          <EmptyState bare className="px-6 py-12" title="No access to Enterprise Administration" description="You do not have permission to view records." />
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
          id="enterprise-admin-heading"
          className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Enterprise Administration
        </h1>
        <p className="mt-1 text-sm text-secondary">
          One workspace to observe how PathOS is configured and governed — laboratory identity, access,
          clients, lab codes, workflow, integrations, notifications, commercial settings, and platform
          controls. It composes the existing owner systems and changes nothing itself.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {ADMIN_SECTIONS.map((s) => {
          if (s.key === 'permissionMatrix') return <PermissionMatrixPanel key={s.key} section={data?.permissionMatrix} loading={isLoading} />;
          if (s.key === 'laboratory') return <LaboratoryPanel key={s.key} section={data?.laboratory} loading={isLoading} />;
          if (s.key === 'branding') return <BrandingPanel key={s.key} section={data?.branding} loading={isLoading} />;
          if (s.key === 'departments') return <DepartmentsPanel key={s.key} section={data?.departments} loading={isLoading} />;
          if (s.key === 'users') return <UsersPanel key={s.key} section={data?.users} loading={isLoading} onOpen={() => router.push('/users')} />;
          if (s.key === 'roles') return <RolesPanel key={s.key} section={data?.roles} loading={isLoading} onOpen={() => router.push('/roles')} />;
          if (s.key === 'permissions') return <PermissionsPanel key={s.key} section={data?.permissions} loading={isLoading} onOpen={() => router.push('/roles')} />;
          return (
            <AdminSection
              key={s.key}
              title={s.title}
              responsibility={s.responsibility}
              status={data?.[s.key]?.status}
              loading={isLoading}
            />
          );
        })}
      </div>
    </div>
  );
}

// One deferred administration section. Distinct truthful states: loading (fetching) / deferred
// ("Not yet loaded") / forbidden ("No access") / error ("Unavailable"). NO configuration values,
// counters, KPIs, status, feature/integration/billing data, or secret presence — the region only
// names what it WILL compose from its owner in a later checkpoint.
function AdminSection({
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
    status === 'forbidden' ? 'No access' : status === 'error' ? 'Unavailable' : loading || !status ? 'Loading' : 'Not yet loaded';
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">{stateBadge}</Badge>
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

// Permission Matrix — the descriptive, permission-aware view of which owner permissions the caller
// holds. Status by text (badge label), never colour alone. It renders ONLY permission booleans;
// no configuration value, secret, or owner record. Truthful notes disclose the superuser bypass and
// the SuperuserGuard-only feature-flag gate.
function PermissionMatrixPanel({
  section,
  loading,
}: {
  section?: EnterpriseAdminOverview['permissionMatrix'];
  loading: boolean;
}) {
  const status = section?.status;
  const data = status === 'ready' ? section?.data : null;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">Permission Matrix</h2>
        {status === 'ready' && data?.isSuperRole && <Badge tone="primary" size="xs">Superuser</Badge>}
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'ready' && data ? (
        <>
          <div className="flex flex-wrap gap-2">
            {PERMISSION_LABELS.map(({ key, label }) => (
              <Badge key={key} tone={data[key] ? 'success' : 'neutral'} size="sm">
                {data[key] ? '' : 'No '}{label}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-meta text-text-tertiary">
            Descriptive only — owner endpoints remain the enforcement authority.
            {data.isSuperRole
              ? ' You hold every capability via the superuser bypass (isSuperRole).'
              : ' Feature flags require the superuser bypass; portal access and change-request permissions are unseeded and superuser-only.'}
          </p>
        </>
      ) : (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="The permission map could not be loaded." />
      )}
    </Card>
  );
}

// Shared section shell for a hydrated admin panel — renders the frozen states truthfully and hands
// `ready` data to `children`. No fabricated values: `forbidden`/`error`/`empty` show honest text.
function SectionShell<T>({
  title,
  section,
  loading,
  emptyText,
  badge,
  children,
}: {
  title: string;
  section?: { status: SectionStatus; data: T | null };
  loading: boolean;
  emptyText: string;
  badge?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  const status = section?.status;
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        {status === 'ready' && badge}
      </div>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'forbidden' ? (
        <EmptyState bare className="px-0 py-6" title="No access" description="You do not have permission to view this section." />
      ) : status === 'error' ? (
        <EmptyState bare className="px-0 py-6" title="Unavailable" description="This section could not be loaded." />
      ) : status === 'empty' || !section?.data ? (
        <EmptyState bare className="px-0 py-6" title="Nothing recorded" description={emptyText} />
      ) : (
        <>{children(section.data as T)}</>
      )}
    </Card>
  );
}

// One recorded field: label + owner value (or "—" when the owner records no value). Never a warning.
function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-lightgray py-1.5 last:border-0">
      <span className="text-meta uppercase tracking-wide text-text-tertiary">{label}</span>
      <span className="text-sm text-text">{value ?? '—'}</span>
    </div>
  );
}

const fmtDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString() : '—');

// Laboratory — recorded profile fields, verbatim from the lab owner.
function LaboratoryPanel({ section, loading }: { section?: EnterpriseAdminOverview['laboratory']; loading: boolean }) {
  return (
    <SectionShell title="Laboratory" section={section} loading={loading} emptyText="No laboratory profile is recorded.">
      {(d) => (
        <div>
          <Field label="Name" value={d.name} />
          <Field label="Tagline" value={d.tagline} />
          <Field label="Address" value={d.address} />
          <Field label="Phone" value={d.phone} />
          <Field label="Email" value={d.email} />
          <Field label="Currency" value={d.currency} />
        </div>
      )}
    </SectionShell>
  );
}

// Branding — recorded name/tagline + logo PRESENCE only (never the asset URL or upload credential).
function BrandingPanel({ section, loading }: { section?: EnterpriseAdminOverview['branding']; loading: boolean }) {
  return (
    <SectionShell title="Branding" section={section} loading={loading} emptyText="No branding is recorded.">
      {(d) => (
        <div>
          <Field label="Name" value={d.name} />
          <Field label="Tagline" value={d.tagline} />
          <div className="flex items-center justify-between gap-2 py-1.5">
            <span className="text-meta uppercase tracking-wide text-text-tertiary">Logo</span>
            <Badge tone={d.logoConfigured ? 'success' : 'neutral'} size="xs">{d.logoConfigured ? 'Configured' : 'Not configured'}</Badge>
          </div>
        </div>
      )}
    </SectionShell>
  );
}

// Departments — recorded rows only (name, description, member count, manager, created). No active
// state (unrecorded), no hierarchy (never calculated).
function DepartmentsPanel({ section, loading }: { section?: EnterpriseAdminOverview['departments']; loading: boolean }) {
  return (
    <SectionShell
      title="Departments"
      section={section}
      loading={loading}
      emptyText="No departments are recorded."
      badge={section?.data ? <Badge tone="neutral" size="xs">{section.data.total} recorded</Badge> : undefined}
    >
      {(d) => (
        <div className="space-y-2">
          {d.items.map((dept) => {
            const meta = [
              dept.memberCount != null ? `${dept.memberCount} member${dept.memberCount === 1 ? '' : 's'}` : null,
              dept.managerName,
              dept.createdAt ? `since ${fmtDate(dept.createdAt)}` : null,
            ].filter(Boolean).join(' · ');
            return (
              <div key={dept.id} className="rounded-lg border border-lightgray px-3 py-2">
                <div className="text-sm font-semibold text-text">{dept.name}</div>
                {meta && <div className="mt-0.5 text-meta text-text-tertiary">{meta}</div>}
                {dept.description && <div className="mt-0.5 text-sm text-text-secondary">{dept.description}</div>}
              </div>
            );
          })}
        </div>
      )}
    </SectionShell>
  );
}

// A small owner-invocation link — navigates to the real owner screen; the workspace never edits.
function OpenOwner({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <div className="mt-3 text-right">
      <Button variant="secondary" size="sm" onClick={onOpen}>{label}</Button>
    </div>
  );
}

// Users — recorded directory. Identity + account state + assigned roles + created date, verbatim.
// No editor, no invite/reset/lock action, no inferred risk. Active state shown as a text badge.
function UsersPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['users']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell
      title="Users"
      section={section}
      loading={loading}
      emptyText="No users are recorded."
      badge={section?.data ? <Badge tone="neutral" size="xs">{section.data.total} recorded</Badge> : undefined}
    >
      {(d) => (
        <div className="space-y-2">
          {d.items.map((u) => {
            const meta = [u.email, u.roles.length ? u.roles.join(', ') : 'No roles', u.createdAt ? `since ${fmtDate(u.createdAt)}` : null].filter(Boolean).join(' · ');
            return (
              <div key={u.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-lightgray px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text">{u.name ?? u.email}</div>
                  <div className="mt-0.5 text-meta text-text-tertiary">{meta}</div>
                </div>
                <Badge tone={u.active ? 'success' : 'neutral'} size="xs">{u.active ? 'Active' : 'Inactive'}</Badge>
              </div>
            );
          })}
          <OpenOwner label="Open users" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// Roles — recorded roles. Stored super-role flag + permission count + description. No editor, no
// assignment. Super-role is a stored flag shown as a text badge, never used as authority here.
function RolesPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['roles']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell
      title="Roles"
      section={section}
      loading={loading}
      emptyText="No roles are recorded."
      badge={section?.data ? <Badge tone="neutral" size="xs">{section.data.total} recorded</Badge> : undefined}
    >
      {(d) => (
        <div className="space-y-2">
          {d.items.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-lightgray px-3 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-text">{r.name}</span>
                  {r.isSuperRole && <Badge tone="primary" size="xs">Super role</Badge>}
                </div>
                <div className="mt-0.5 text-meta text-text-tertiary">
                  {`${r.permissionCount} permission${r.permissionCount === 1 ? '' : 's'}`}
                </div>
                {r.description && <div className="mt-0.5 text-sm text-text-secondary">{r.description}</div>}
              </div>
            </div>
          ))}
          <OpenOwner label="Open roles" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// Permissions — the current catalog. Exact code + description only. No per-permission seeded/
// provenance claim, no invented grouping or severity; roles-that-hold is not owner-exposed, so not shown.
function PermissionsPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['permissions']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell
      title="Permissions"
      section={section}
      loading={loading}
      emptyText="No permissions are recorded."
      badge={section?.data ? <Badge tone="neutral" size="xs">{section.data.total} in catalog</Badge> : undefined}
    >
      {(d) => (
        <div className="space-y-1.5">
          {d.items.map((p) => (
            <div key={p.code} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-lightgray py-1.5 last:border-0">
              <span className="font-mono text-sm text-text">{p.code}</span>
              <span className="text-meta text-text-tertiary">{p.description}</span>
            </div>
          ))}
          <OpenOwner label="Open roles &amp; permissions" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}
