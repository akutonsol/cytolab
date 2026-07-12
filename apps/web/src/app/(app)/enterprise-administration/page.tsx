'use client';

// Enterprise Administration & Controls Workspace — A1: the shell only.
// Orchestration surface (future). A1 establishes route, permission gate, section hierarchy,
// return-to-worklist navigation, accessibility, and responsive layout — and NOTHING else.
// There is intentionally NO data fetching, NO React Query, NO aggregate call, NO owner-service
// call, NO Prisma, NO counters/KPIs/status/mock values. Every section renders truthfully as
// "Not yet loaded" (the frozen `deferred` state) until its checkpoint (A2–A9) hydrates it.
// Contract: docs/PATHOS_ENTERPRISE_ADMINISTRATION_IMPLEMENTATION_PLAN.md (§1, §3, §4, §5, §10).

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Badge, Card, EmptyState } from '@/components/ui';

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
// Each `responsibility` is a case-neutral description of what the section WILL compose from
// its owner — never a value, count, or status. At A1 every section is `deferred`.
const ADMIN_SECTIONS: { key: string; title: string; responsibility: string }[] = [
  { key: 'laboratory', title: 'Laboratory', responsibility: 'Recorded laboratory profile and operating preferences.' },
  { key: 'branding', title: 'Branding', responsibility: 'Recorded branding and logo configuration.' },
  { key: 'departments', title: 'Departments', responsibility: 'The recorded departments.' },
  { key: 'users', title: 'Users', responsibility: 'The user directory and each user’s assigned roles.' },
  { key: 'roles', title: 'Roles', responsibility: 'The recorded roles.' },
  { key: 'permissions', title: 'Permissions', responsibility: 'The descriptive role-to-permission map.' },
  { key: 'security', title: 'Security', responsibility: 'Security posture: sessions, login history, MFA coverage, locks, alerts, password policy.' },
  { key: 'clients', title: 'Clients', responsibility: 'The client directory.' },
  { key: 'lab-codes', title: 'Lab Codes', responsibility: 'The lab-code catalog.' },
  { key: 'code-sheets', title: 'Code Sheets', responsibility: 'The recorded code-sheet configuration.' },
  { key: 'forms', title: 'Forms', responsibility: 'The recorded form configuration.' },
  { key: 'fhir', title: 'FHIR', responsibility: 'Configured FHIR endpoints and transmission health (never secrets).' },
  { key: 'notifications', title: 'Notifications', responsibility: 'The recorded notification preferences.' },
  { key: 'billing', title: 'Billing', responsibility: 'The recorded billing configuration.' },
  { key: 'services', title: 'Services', responsibility: 'The services and pricing catalog.' },
  { key: 'taxes', title: 'Taxes', responsibility: 'The recorded tax configuration.' },
  { key: 'feature-flags', title: 'Feature Flags', responsibility: 'Enabled modules and feature flags.' },
  { key: 'system-health', title: 'System Health', responsibility: 'System health and maintenance status.' },
  { key: 'ai-settings', title: 'AI Settings', responsibility: 'The recorded AI reporting settings.' },
  { key: 'portal-access', title: 'Portal Access', responsibility: 'Client portal access status.' },
  { key: 'lifecycle', title: 'Lifecycle Observation', responsibility: 'The recorded record-status history — observation only.' },
  { key: 'permission-matrix', title: 'Permission Matrix', responsibility: 'The descriptive permission map for the current user.' },
];

export default function EnterpriseAdministrationWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, hydrated } = useAuth();
  const returnTo = safeReturnTo(searchParams.get('returnTo')) ?? '/records';
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedOnce = useRef(false);

  // Move focus to the workspace heading once on direct entry (accessibility). There is no
  // data load at A1, so nothing can steal it.
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
        {ADMIN_SECTIONS.map((s) => (
          <AdminSection key={s.key} title={s.title} responsibility={s.responsibility} />
        ))}
      </div>
    </div>
  );
}

// One administration section. At A1 every section is `deferred`, rendered truthfully as
// "Not yet loaded". No evidence, counters, KPIs, status, or mock configuration — the region
// only names what it WILL compose from its owner in a later checkpoint.
function AdminSection({ title, responsibility }: { title: string; responsibility: string }) {
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <Badge tone="neutral" size="xs">Not yet loaded</Badge>
      </div>
      <EmptyState bare className="px-0 py-8" title="Not yet loaded" description={responsibility} />
    </Card>
  );
}
