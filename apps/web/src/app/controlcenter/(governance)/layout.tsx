'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity, ArrowLeft, Fingerprint, KeyRound, LayoutDashboard, ListChecks, Lock,
  MonitorSmartphone, Puzzle, Receipt, Settings2, Shield, ShieldAlert, ToggleRight, UserX,
} from 'lucide-react';
import { useAuth, useAuthStore } from '@/lib/auth';
import { api, refreshSession, validatePersistedSession } from '@/lib/api';
import { saveReturnTo } from '@/lib/session-drafts';
import { cn } from '@/components/ui';
import AccessRestricted from './AccessRestricted';

// Control Center is a dedicated governance shell (a sibling of the main app, like /portal).
// It reuses the existing Security / Settings / Features surfaces via re-exported routes, so
// there is one source of truth — this file only owns the shell, gate and navigation.
const NAV: { section?: string; items: { label: string; href: string; icon: typeof Shield }[] }[] = [
  { items: [{ label: 'Overview', href: '/controlcenter', icon: LayoutDashboard }] },
  {
    section: 'Security',
    items: [
      { label: 'Security Center', href: '/controlcenter/security', icon: Shield },
      { label: 'Alerts', href: '/controlcenter/security/alerts', icon: ShieldAlert },
      { label: 'Active Sessions', href: '/controlcenter/security/sessions', icon: MonitorSmartphone },
      { label: 'Blocked IPs', href: '/controlcenter/security/blocked-ips', icon: Lock },
      { label: 'Locked Users', href: '/controlcenter/security/locked-users', icon: UserX },
      { label: 'Login History', href: '/controlcenter/security/login-history', icon: Activity },
      { label: 'MFA', href: '/controlcenter/security/mfa', icon: Fingerprint },
      { label: 'Trusted Devices', href: '/controlcenter/security/trusted-devices', icon: KeyRound },
      { label: 'Password Policy', href: '/controlcenter/security/password-policy', icon: ListChecks },
    ],
  },
  { section: 'Configuration', items: [{ label: 'Settings', href: '/controlcenter/settings', icon: Settings2 }] },
  { section: 'Billing', items: [{ label: 'Lab Invoicing', href: '/controlcenter/billing', icon: Receipt }] },
  {
    section: 'Features',
    items: [
      { label: 'Feature Governance', href: '/controlcenter/features', icon: ToggleRight },
      { label: 'Modules', href: '/controlcenter/modules', icon: Puzzle },
    ],
  },
];

export default function ControlCenterLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { claims, hydrated, isAuthed, stale, can } = useAuth();
  const clear = useAuthStore((s) => s.clear);
  // App-governance access: super roles, or the system/security operators.
  const allowed = !!claims && (claims.isSuperRole || can('system:health') || can('system:security'));

  const sessionExpiredRef = useRef(false);
  const sessionCheckedRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  // Not authed → Control Center's own login (same staff credentials, like /portal
  // has /portal/login). Save returnTo so a deep link returns to that sub-route.
  useEffect(() => {
    if (!hydrated || isAuthed) return;
    if (window.location.pathname.startsWith('/controlcenter/login')) return;
    saveReturnTo(window.location.pathname + window.location.search);
    router.replace(sessionExpiredRef.current ? '/controlcenter/login?reason=session_expired' : '/controlcenter/login');
  }, [hydrated, isAuthed, router]);

  // Authed but stale claims (version bump) → refresh before trusting roles/permissions.
  useEffect(() => {
    if (hydrated && isAuthed && stale && !refreshing) {
      setRefreshing(true);
      refreshSession().then((ok) => { if (!ok) { clear(); router.replace('/controlcenter/login'); } }).finally(() => setRefreshing(false));
    }
  }, [hydrated, isAuthed, stale, refreshing, clear, router]);

  // On boot, validate persisted claims against the live cookie session, so a valid
  // session repopulates the shell and a dead/rotated cookie can't mask stale localStorage.
  useEffect(() => {
    if (!hydrated || !isAuthed || sessionCheckedRef.current) return;
    sessionCheckedRef.current = true;
    validatePersistedSession().then((ok) => {
      if (ok) return;
      sessionExpiredRef.current = true;
      try { localStorage.removeItem('cytolab-auth'); } catch { /* ignore */ }
      api.post('/auth/logout').catch(() => {});
      clear();
    });
  }, [hydrated, isAuthed, clear]);

  // While unauthenticated (redirecting to login) or mid-refresh, decide nothing yet.
  if (!hydrated || !isAuthed || stale) return null;
  // Authenticated but NOT authorized for governance → stay in the Control Center
  // experience and explain it (no silent bounce to /dashboard). Authorization is still
  // enforced server-side; the shell and its data-fetching children never mount here.
  if (!allowed) return <AccessRestricted />;

  const name = claims.email;
  const initials = (claims.email?.[0] ?? '?').toUpperCase();
  const isActive = (href: string) =>
    href === '/controlcenter' ? pathname === '/controlcenter' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-screen bg-surface-alt">
      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-card bg-surface">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white"><Shield size={18} /></span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-charcoal-heading">Control Center</div>
            <div className="text-meta text-text-tertiary">App governance</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((group, gi) => (
            <div key={gi} className="mb-2">
              {group.section && (
                <div className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">{group.section}</div>
              )}
              {group.items.map((it) => {
                const on = isActive(it.href);
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                      on ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:bg-surface-alt hover:text-text',
                    )}
                  >
                    <Icon size={16} className="shrink-0" /> {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <Link
          href="/dashboard"
          className="m-3 flex items-center gap-2 rounded-lg border border-card px-3 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-alt hover:text-text"
        >
          <ArrowLeft size={16} /> Back to app
        </Link>
      </aside>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-end border-b border-card bg-surface px-6">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-[12px] font-bold text-white">{initials}</span>
            <span className="text-sm font-semibold text-text">{name}</span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
