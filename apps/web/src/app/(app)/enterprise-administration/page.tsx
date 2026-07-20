'use client';

// Enterprise Administration & Controls Workspace — A2: connect the shell to the read-only
// aggregate (GET /enterprise-administration/overview) and freeze the section-status contract.
// A2 renders ONLY the descriptive permission map (`permissionMatrix` → ready); the other 21
// sections stay truthfully `deferred`. NO owner data, NO configuration values, NO counters/KPIs,
// NO secrets, NO mutations/forms/modals. Each section resolves independently so a future failure
// isolates to it and never collapses the permission map, siblings, or the shell.
// Contract: docs/OSIERI_ENTERPRISE_ADMINISTRATION_IMPLEMENTATION_PLAN.md (§1, §3, §4, §5, §8).

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Keyboard } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import type { AdminCapabilityPermission, EnterpriseAdminOverview, SectionStatus } from './types';

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

export default function EnterpriseAdministrationWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, hydrated } = useAuth();
  const returnTo = safeReturnTo(searchParams.get('returnTo')) ?? '/records';
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedOnce = useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);

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

  // Restrained, discoverable keyboard workflow (navigation only — never a mutation or owner action,
  // mirrors the Quality/Sign-Out grammar). W returns to the validated source, A focuses the heading,
  // ? toggles the help sheet, Esc closes it. Shortcuts never fire from a form control, with a
  // modifier, or while a modal/drawer/dialog is open; every one has a visible, clickable equivalent.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      // Never hijack keys while an antd modal/drawer (or any foreign dialog) owns the screen.
      if (document.querySelector('.ant-modal-wrap:not([style*="display: none"]), .ant-drawer-open, [role="dialog"][aria-modal="true"]:not([data-admin-help])')) return;
      if (e.key === 'Escape') { if (helpOpen) { e.preventDefault(); setHelpOpen(false); } return; }
      if (e.key === '?') { e.preventDefault(); setHelpOpen((v) => !v); return; }
      if (e.shiftKey) return; // W/A are single-key; don't fire on shifted variants
      if (helpOpen) return; // while the sheet is open only ?/Esc act
      const k = e.key.toLowerCase();
      if (k === 'w') { e.preventDefault(); router.push(returnTo); }
      else if (k === 'a') { e.preventDefault(); headingRef.current?.focus({ preventScroll: true }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen, returnTo, router]);

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
      <PageHeader
        back={backToWorklist}
        title="Enterprise Administration"
        titleRef={headingRef}
        focusableTitle
        description="One workspace to observe how Osieri is configured and governed — laboratory identity, access, clients, lab codes, workflow, integrations, notifications, commercial settings, and platform controls. It composes the existing owner systems and changes nothing itself."
        meta={
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="inline-flex items-center gap-1.5 text-meta font-medium text-text-tertiary hover:text-primary"
            title="Keyboard shortcuts"
          >
            <Keyboard size={13} /> Keyboard shortcuts <kbd className="rounded border border-lightgray px-1 text-[11px]">?</kbd>
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {ADMIN_SECTIONS.map((s) => {
          if (s.key === 'permissionMatrix') return <PermissionMatrixPanel key={s.key} section={data?.permissionMatrix} loading={isLoading} />;
          if (s.key === 'laboratory') return <LaboratoryPanel key={s.key} section={data?.laboratory} loading={isLoading} />;
          if (s.key === 'branding') return <BrandingPanel key={s.key} section={data?.branding} loading={isLoading} />;
          if (s.key === 'departments') return <DepartmentsPanel key={s.key} section={data?.departments} loading={isLoading} />;
          if (s.key === 'users') return <UsersPanel key={s.key} section={data?.users} loading={isLoading} onOpen={() => router.push('/users')} />;
          if (s.key === 'roles') return <RolesPanel key={s.key} section={data?.roles} loading={isLoading} onOpen={() => router.push('/roles')} />;
          if (s.key === 'permissions') return <PermissionsPanel key={s.key} section={data?.permissions} loading={isLoading} onOpen={() => router.push('/roles')} />;
          if (s.key === 'security') return <SecurityPanel key={s.key} section={data?.security} loading={isLoading} onOpen={() => router.push('/security')} />;
          if (s.key === 'clients') return <ClientsPanel key={s.key} section={data?.clients} loading={isLoading} onOpen={() => router.push('/clients')} />;
          if (s.key === 'labCodes') return <LabCodesPanel key={s.key} section={data?.labCodes} loading={isLoading} onOpen={() => router.push('/lab-codes')} />;
          if (s.key === 'codeSheets') return <CodeSheetsPanel key={s.key} section={data?.codeSheets} loading={isLoading} onOpen={() => router.push('/lab-codes')} />;
          if (s.key === 'lifecycle') return <LifecyclePanel key={s.key} section={data?.lifecycle} loading={isLoading} onOpen={() => router.push('/records')} />;
          if (s.key === 'fhir') return <FhirPanel key={s.key} section={data?.fhir} loading={isLoading} onOpen={() => router.push('/fhir')} />;
          if (s.key === 'billing') return <BillingPanel key={s.key} section={data?.billing} loading={isLoading} onOpen={() => router.push('/billing')} />;
          if (s.key === 'services') return <ServicesPanel key={s.key} section={data?.services} loading={isLoading} onOpen={() => router.push('/services')} />;
          if (s.key === 'taxes') return <TaxesPanel key={s.key} section={data?.taxes} loading={isLoading} onOpen={() => router.push('/settings')} />;
          if (s.key === 'featureFlags') return <FeatureFlagsPanel key={s.key} section={data?.featureFlags} loading={isLoading} onOpen={() => router.push('/settings/features')} />;
          if (s.key === 'systemHealth') return <SystemHealthPanel key={s.key} section={data?.systemHealth} loading={isLoading} onOpen={() => router.push('/system')} />;
          if (s.key === 'aiSettings') return <AiSettingsPanel key={s.key} section={data?.aiSettings} loading={isLoading} onOpen={() => router.push('/settings')} />;
          if (s.key === 'portalAccess') return <PortalAccessPanel key={s.key} section={data?.portalAccess} loading={isLoading} onOpen={() => router.push('/clients')} />;
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

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

// Keyboard-shortcut sheet. Navigation-only shortcuts, each with a visible equivalent elsewhere in the
// workspace. `data-admin-help` marks it so the page's own key handler does not treat it as a blocking
// foreign modal. Esc or the backdrop/close button dismiss it.
function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const rows: { keys: string; action: string }[] = [
    { keys: 'W', action: 'Return to the source worklist' },
    { keys: 'A', action: 'Focus the workspace heading' },
    { keys: '?', action: 'Toggle this shortcut sheet' },
    { keys: 'Esc', action: 'Close this shortcut sheet' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-heading/30 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        data-admin-help
        className="w-full max-w-sm rounded-xl border border-lightgray bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-text">Keyboard shortcuts</h2>
        <dl className="space-y-2">
          {rows.map((r) => (
            <div key={r.keys} className="flex items-center justify-between gap-3">
              <dt className="text-sm text-text-secondary">{r.action}</dt>
              <dd><kbd className="rounded border border-lightgray px-1.5 py-0.5 text-meta font-semibold text-text">{r.keys}</kbd></dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-meta text-text-tertiary">Shortcuts never fire inside a text field or with a modifier key. Each has a visible control too.</p>
        <div className="mt-4 text-right">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
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

// Access-model label for a capability's accessType — text, never colour alone.
function accessLabel(c: AdminCapabilityPermission): string {
  if (c.accessType === 'superuser-guard') return 'SuperuserGuard';
  if (c.accessType === 'deferred') return c.permissionCode ?? 'Deferred';
  return c.permissionCode ?? '—';
}

// Truthful evidence phrase for the current-grant reachability of a capability (never fabricated). Only stated
// when the owner reads prove it; otherwise the caller lacks catalog/grant visibility (a caveat says so).
function grantPhrase(c: AdminCapabilityPermission): string | null {
  if (c.catalogPresent === false) return 'Declared, unseeded — superuser-only';
  if (c.superuserOnlyUnderCurrentGrants === true) return c.accessType === 'superuser-guard' ? 'SuperuserGuard only' : 'Superuser-only (current grants)';
  if (c.superuserOnlyUnderCurrentGrants === false) return 'Held by a standard role';
  return null; // unproven for this caller
}

// Permission Matrix — the descriptive access model for every administration section. It explains
// which real permission or guard controls each section, whether THIS caller holds it, whether the
// section is Ready or Deferred, and (where owner reads prove it) whether it is superuser-only under
// the current grants. Status/access are conveyed by TEXT (Yes/No, badge label), never colour alone.
// It renders NO configuration value, NO secret, NO owner record — and NO editor/assignment control.
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
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">Permission Matrix</h2>
        {status === 'ready' && data?.effective.isSuperRole && <Badge tone="primary" size="xs">Superuser</Badge>}
      </div>
      <p className="mb-3 text-meta text-text-tertiary">
        Descriptive only — it grants nothing and changes nothing. Owner endpoints remain the enforcement authority.
      </p>
      {loading || !status ? (
        <div className="space-y-2"><Skeleton shape="text" width="w-48" /><Skeleton shape="text" width="w-40" /></div>
      ) : status === 'ready' && data ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-card text-meta uppercase tracking-wide text-text-tertiary">
                  <th className="py-2 pr-3 font-semibold">Section</th>
                  <th className="py-2 pr-3 font-semibold">Controlled by</th>
                  <th className="py-2 pr-3 font-semibold">Your access</th>
                  <th className="py-2 pr-3 font-semibold">State</th>
                  <th className="py-2 font-semibold">Grant reachability</th>
                </tr>
              </thead>
              <tbody>
                {data.capabilities.map((c) => {
                  const phrase = grantPhrase(c);
                  return (
                    <tr key={c.key} className="border-b border-card/60 align-top">
                      <td className="py-2 pr-3">
                        <span className="font-semibold text-text">{c.section}</span>
                        {c.ownerPath && <a href={c.ownerPath} className="ml-2 text-caption text-primary hover:underline">{c.ownerPath}</a>}
                      </td>
                      <td className="py-2 pr-3">
                        <code className="rounded bg-surface-container px-1.5 py-0.5 text-caption text-text-secondary">{accessLabel(c)}</code>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={c.callerHasAccess ? 'success' : 'neutral'} size="xs">{c.callerHasAccess ? 'Yes' : 'No'}</Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={c.implementationStatus === 'ready' ? 'primary' : 'neutral'} size="xs">
                          {c.implementationStatus === 'ready' ? 'Ready' : 'Deferred'}
                        </Badge>
                      </td>
                      <td className="py-2 text-caption text-text-secondary">{phrase ?? <span className="text-text-tertiary">Not visible to you</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.caveats.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-card pt-3">
              {data.caveats.map((cv) => (
                <li key={cv.key} className="text-meta text-text-tertiary">
                  <span className="font-semibold text-text-secondary">{cv.label}:</span> {cv.note}
                </li>
              ))}
            </ul>
          )}
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

// One safe security count: label + owner-recorded number. Never a score, meter, or risk framing.
function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-lightgray py-1.5 last:border-0">
      <span className="text-meta uppercase tracking-wide text-text-tertiary">{label}</span>
      <span className="text-sm font-semibold text-text">{value}</span>
    </div>
  );
}

// Security — safe owner-recorded posture COUNTS + newest event time. No MFA/password/unlock/session
// action, no policy editor, no risk/threat/score. The detail (event lists) lives on /security.
function SecurityPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['security']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell title="Security" section={section} loading={loading} emptyText="No security posture is recorded.">
      {(d) => (
        <div>
          <CountRow label="Active sessions" value={d.activeSessions} />
          <CountRow label="Failed logins (24h)" value={d.failedLogins24h} />
          <CountRow label="Locked accounts" value={d.lockedAccounts} />
          <CountRow label="Open security alerts" value={d.openAlerts} />
          <CountRow label="Blocked IPs" value={d.blockedIps} />
          <div className="flex items-baseline justify-between gap-2 py-1.5">
            <span className="text-meta uppercase tracking-wide text-text-tertiary">Last recorded event</span>
            <span className="text-sm text-text">{d.lastEventAt ? fmtDateTime(d.lastEventAt) : '—'}</span>
          </div>
          <OpenOwner label="Open security" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

const fmtDateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';

// Clients — recorded directory. Contact/location/portal status shown as owner facts only. No editor,
// no portal manager, no billing controls, no inferred standing.
function ClientsPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['clients']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell
      title="Clients"
      section={section}
      loading={loading}
      emptyText="No clients are recorded."
      badge={section?.data ? <Badge tone="neutral" size="xs">{section.data.total} recorded</Badge> : undefined}
    >
      {(d) => (
        <div className="space-y-2">
          {d.items.map((c) => {
            const meta = [c.accountNumber ? `Acct ${c.accountNumber}` : null, c.clientType, c.location, c.contact].filter(Boolean).join(' · ');
            return (
              <div key={c.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-lightgray px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text">{c.name ?? '—'}</div>
                  {meta && <div className="mt-0.5 text-meta text-text-tertiary">{meta}</div>}
                </div>
                <div className="flex items-center gap-1.5">
                  {c.portalAccountConfigured && <Badge tone="neutral" size="xs" title="Portal account configured">Portal account configured</Badge>}
                  <Badge tone={c.active ? 'success' : 'neutral'} size="xs">{c.active ? 'Active' : 'Inactive'}</Badge>
                </div>
              </div>
            );
          })}
          <OpenOwner label="Open clients" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// Lab Codes — recorded codes. `clientsUsing` shown as an owner count (not a priority). No editor.
function LabCodesPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['labCodes']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell
      title="Lab Codes"
      section={section}
      loading={loading}
      emptyText="No lab codes are recorded."
      badge={section?.data ? <Badge tone="neutral" size="xs">{section.data.total} recorded</Badge> : undefined}
    >
      {(d) => (
        <div className="space-y-1.5">
          {d.items.map((lc) => {
            const meta = [lc.region, lc.clientsUsing != null ? `${lc.clientsUsing} client${lc.clientsUsing === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
            return (
              <div key={lc.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-lightgray py-1.5 last:border-0">
                <span className="font-mono text-sm text-text">{lc.code}</span>
                <span className="text-meta text-text-tertiary">{meta || '—'}</span>
              </div>
            );
          })}
          <OpenOwner label="Open code vault" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// Lifecycle Observation — OBSERVE only. Shows the modeled RecordStatus set with the owner's own
// counts, plus an explicit observation-only disclosure of the current (not future) reality. There is
// NO status editor / transition selector / approve / authorize / release / archive / override control.
function LifecyclePanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['lifecycle']; loading: boolean; onOpen: () => void }) {
  const disclosure = (
    <p className="mb-3 text-meta text-text-tertiary">
      Observation only — the Records owner is the sole lifecycle authority. Lifecycle is event-driven:
      owner actions (submit, result, authorization, billing, payment, QC) advance workflow and record a
      status event. Manual status changes go through the owner’s constrained transition
      (PATCH&nbsp;/specimen/status/:id) — not free editing. Pending is the initial state; there is no
      separate Started, Released, or Archived status.
    </p>
  );
  return (
    <SectionShell
      title="Lifecycle Observation"
      section={section}
      loading={loading}
      emptyText="No record lifecycle is recorded."
      badge={section?.data ? <Badge tone="neutral" size="xs">{section.data.totalRecords} records</Badge> : undefined}
    >
      {(d) => (
        <div>
          {disclosure}
          <div className="space-y-1">
            {d.statuses.map((s) => (
              <div key={s.status} className="flex items-baseline justify-between gap-2 border-b border-lightgray py-1.5 last:border-0">
                <span className="text-sm text-text">{s.status}</span>
                <span className="text-sm font-semibold text-text">{s.count}</span>
              </div>
            ))}
          </div>
          <OpenOwner label="Open records" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// Health-status tone — maps ok/warn/error to non-orange tones (warn → neutral, never amber).
const healthTone = (s: string): 'success' | 'danger' | 'neutral' =>
  s === 'ok' ? 'success' : s === 'error' ? 'danger' : 'neutral';

// FHIR — configured endpoints + status. No credential editor / connection tester. Secrets never shown.
function FhirPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['fhir']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell title="FHIR" section={section} loading={loading} emptyText="No FHIR endpoints are configured."
      badge={section?.data ? <Badge tone="neutral" size="xs">{section.data.total} configured</Badge> : undefined}>
      {(d) => (
        <div className="space-y-2">
          {d.items.map((e) => {
            const meta = [e.system, e.environment, e.transmissionCount != null ? `${e.transmissionCount} transmissions` : null, e.lastTestedAt ? `tested ${fmtDate(e.lastTestedAt)}` : null].filter(Boolean).join(' · ');
            return (
              <div key={e.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-lightgray px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text">{e.name}</div>
                  <div className="mt-0.5 text-meta text-text-tertiary">{meta}</div>
                </div>
                <Badge tone={e.enabled ? 'success' : 'neutral'} size="xs">{e.enabled ? 'Enabled' : 'Disabled'}</Badge>
              </div>
            );
          })}
          <OpenOwner label="Open FHIR" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// Billing — bill counts by status only. No revenue, no editor.
function BillingPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['billing']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell title="Billing" section={section} loading={loading} emptyText="No bills are recorded.">
      {(d) => (
        <div>
          {d.billsByStatus.length ? d.billsByStatus.map((b) => <CountRow key={b.status} label={b.status} value={b.count} />) : <p className="py-1.5 text-sm text-text-secondary">No bills recorded.</p>}
          <OpenOwner label="Open billing" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// Services — recorded catalog. Price shown verbatim (minor units). No editor/calculation.
function ServicesPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['services']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell title="Services" section={section} loading={loading} emptyText="No services are recorded."
      badge={section?.data ? <Badge tone="neutral" size="xs">{section.data.total} recorded</Badge> : undefined}>
      {(d) => (
        <div className="space-y-1.5">
          {d.items.map((s) => (
            <div key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-lightgray py-1.5 last:border-0">
              <span className="text-sm text-text">{s.name}{!s.active && <span className="ml-1 text-meta text-text-tertiary">(inactive)</span>}</span>
              <span className="text-meta text-text-tertiary">{s.price != null ? (s.price / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : '—'}</span>
            </div>
          ))}
          <OpenOwner label="Open services" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// Taxes — recorded rate (basis points → %). No computation, no editor.
function TaxesPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['taxes']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell title="Taxes" section={section} loading={loading} emptyText="No taxes are recorded."
      badge={section?.data ? <Badge tone="neutral" size="xs">{section.data.total} recorded</Badge> : undefined}>
      {(d) => (
        <div className="space-y-1.5">
          {d.items.map((t) => (
            <div key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-lightgray py-1.5 last:border-0">
              <span className="text-sm text-text">{t.name}{t.isDefault && <span className="ml-1 text-meta text-text-tertiary">(default)</span>}</span>
              <span className="text-meta text-text-tertiary">{t.rateBasisPoints != null ? `${(t.rateBasisPoints / 100).toFixed(2)}%` : '—'}</span>
            </div>
          ))}
          <OpenOwner label="Open taxes" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// Feature Flags — recorded module status only (superuser-gated). No toggle.
function FeatureFlagsPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['featureFlags']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell title="Feature Flags" section={section} loading={loading} emptyText="No feature flags are recorded."
      badge={section?.data ? <Badge tone="neutral" size="xs">{section.data.total} modules</Badge> : undefined}>
      {(d) => (
        <div className="space-y-1">
          {d.items.map((f) => (
            <div key={f.featureKey} className="flex items-baseline justify-between gap-2 border-b border-lightgray py-1.5 last:border-0">
              <span className="font-mono text-sm text-text">{f.featureKey}</span>
              <Badge tone={f.isEnabled ? 'success' : 'neutral'} size="xs">{f.isEnabled ? 'Enabled' : 'Disabled'}</Badge>
            </div>
          ))}
          <OpenOwner label="Open modules" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// System Health — safe recorded checks only (env vars/version/logs excluded). No remediation controls.
function SystemHealthPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['systemHealth']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell title="System Health" section={section} loading={loading} emptyText="No system health is recorded."
      badge={section?.data ? <Badge tone={healthTone(section.data.overall)} size="xs">{section.data.overall}</Badge> : undefined}>
      {(d) => (
        <div className="space-y-1">
          {d.generatedAt && <p className="mb-2 text-meta text-text-tertiary">Last checked {fmtDateTime(d.generatedAt)}</p>}
          {d.checks.map((c) => (
            <div key={c.name} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-lightgray py-1.5 last:border-0">
              <span className="text-sm text-text">{c.name}{c.message ? <span className="ml-1 text-meta text-text-tertiary">{c.message}</span> : null}</span>
              <Badge tone={healthTone(c.status)} size="xs">{c.status}</Badge>
            </div>
          ))}
          <OpenOwner label="Open system health" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// AI Settings — safe status only (never the key/prompts/redaction). No editor.
function AiSettingsPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['aiSettings']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell title="AI Settings" section={section} loading={loading} emptyText="No AI settings are recorded.">
      {(d) => (
        <div>
          <div className="flex items-center justify-between gap-2 border-b border-lightgray py-1.5">
            <span className="text-meta uppercase tracking-wide text-text-tertiary">AI reporting</span>
            <Badge tone={d.enabled ? 'success' : 'neutral'} size="xs">{d.enabled ? 'Enabled' : 'Disabled'}</Badge>
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-lightgray py-1.5">
            <span className="text-meta uppercase tracking-wide text-text-tertiary">API key</span>
            <Badge tone={d.apiKeyConfigured ? 'success' : 'neutral'} size="xs">{d.apiKeyConfigured ? 'Configured' : 'Not configured'}</Badge>
          </div>
          <Field label="Model" value={d.model} />
          <OpenOwner label="Open settings" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// Portal Access — the owner's accurate configured-account total only. No active/inactive/enabled/
// login/authorization status is claimed. Never usernames/emails/tokens/2FA/login state. No manager.
function PortalAccessPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['portalAccess']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell title="Portal Access" section={section} loading={loading} emptyText="No portal accounts are recorded.">
      {(d) => (
        <div>
          <CountRow label="Configured portal accounts" value={d.configuredCount} />
          <OpenOwner label="Open clients" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}

// Code Sheets — recorded reference sheets. Owner fields only. No editor.
function CodeSheetsPanel({ section, loading, onOpen }: { section?: EnterpriseAdminOverview['codeSheets']; loading: boolean; onOpen: () => void }) {
  return (
    <SectionShell
      title="Code Sheets"
      section={section}
      loading={loading}
      emptyText="No code sheets are recorded."
      badge={section?.data ? <Badge tone="neutral" size="xs">{section.data.total} recorded</Badge> : undefined}
    >
      {(d) => (
        <div className="space-y-2">
          {d.items.map((cs) => (
            <div key={cs.id} className="rounded-lg border border-lightgray px-3 py-2">
              <div className="text-sm font-semibold text-text">{cs.name}</div>
              {cs.description && <div className="mt-0.5 text-sm text-text-secondary">{cs.description}</div>}
            </div>
          ))}
          <OpenOwner label="Open code vault" onOpen={onOpen} />
        </div>
      )}
    </SectionShell>
  );
}
