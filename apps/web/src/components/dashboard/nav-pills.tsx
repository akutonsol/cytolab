'use client';

import { createElement, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Dropdown } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { ANALYTICS_ITEM, CENTER_GROUP_KEYS, HOME_ITEM, NAV_GROUPS } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import { api } from '@/lib/api';

/**
 * Top-bar navigation — permission-filtered pills. Compact and borderless:
 * inactive pills are plain icon + text (white wash on hover), the active pill
 * is an indigo fill with a small white dot. Group pills open dropdowns on
 * hover/click with no visible chevron.
 */
export function NavPills({ justify = 'flex-end' }: { justify?: React.CSSProperties['justifyContent'] } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { can } = useAuth();
  const { isEnabled } = useFeatures();
  const visible = (i: any) => can(i.permission) && (!i.feature || isEnabled(i.feature));

  // Live pending-escalation count → red badge on the Escalations nav item.
  // Shares the ['escalation-summary'] cache with the dashboard/escalations page,
  // so the queryFn returns the full summary object (consumers read .pending).
  const { data: escSummary } = useQuery({
    queryKey: ['escalation-summary'],
    queryFn: () => api.get('/escalations/summary').then((r) => r.data as { pending: number }),
    enabled: can('record:view') && isEnabled('ABNORMAL_ESCALATION'),
    refetchInterval: 60_000,
  });
  const escPending = escSummary?.pending ?? 0;
  const itemLabel = (i: any) =>
    i.path === '/escalations' && escPending > 0 ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {i.label}
        <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#EF4444', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-grid', placeItems: 'center' }}>{escPending > 9 ? '9+' : escPending}</span>
      </span>
    ) : (
      i.label
    );

  const centerGroups = CENTER_GROUP_KEYS.map((k) => NAV_GROUPS.find((g) => g.key === k))
    .filter(Boolean)
    .map((g) => ({ ...(g as any), visible: (g as any).items.filter(visible) }))
    .filter((g) => g.visible.length > 0);
  const analyticsVisible = can(ANALYTICS_ITEM.permission);
  const groupActive = (items: any[]) => items.some((i: any) => i.path === pathname);

  // Prefetch route bundles so navigation is instant (prod). The always-visible
  // top-level pills are prefetched on mount; each group's routes are prefetched
  // the moment the user hovers the group pill — before they pick a menu item.
  // (Next disables prefetch in dev, so this is a no-op there.)
  const prefetch = (path?: string) => { if (path) router.prefetch(path); };
  useEffect(() => {
    if (can(HOME_ITEM.permission)) prefetch(HOME_ITEM.path);
    if (analyticsVisible) prefetch(ANALYTICS_ITEM.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const prefetchGroup = (items: any[]) => items.forEach((i: any) => prefetch(i.path));

  // The Quality & Governance workspace is a return-aware surface (like Sign-Out): entering it
  // carries an encoded, internal-only `returnTo` = the current route, so its Worklist/back
  // action deterministically restores the source. Every other nav target is pushed as-is.
  // The workspace re-validates `returnTo` server-side of the trust boundary (safeReturnTo).
  const navTarget = (key: string) => {
    if (key !== '/quality-governance' || typeof window === 'undefined') return key;
    const src = window.location.pathname + window.location.search;
    if (src.startsWith('/quality-governance') || src.startsWith('/login')) return key;
    return `${key}?returnTo=${encodeURIComponent(src)}`;
  };

  const Pill = (isActive: boolean, icon: React.ReactNode, label: string, onClick?: () => void, onMouseEnter?: () => void) => (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`nav-item whitespace-nowrap text-base font-semibold ${isActive ? 'active text-white' : 'text-gray-700'}`}
    >
      <span className={`inline-flex ${isActive ? 'text-white' : 'text-indigo-500'}`}>{icon}</span>
      <span>{label}</span>
      {isActive && <span className="ml-1 h-2 w-2 rounded-full bg-white" />}
    </button>
  );

  return (
    <div className="navigation-menu" style={{ flexWrap: 'nowrap', justifyContent: justify }}>
      {can(HOME_ITEM.permission) && Pill(pathname === HOME_ITEM.path, createElement(HOME_ITEM.icon!, { size: 20, strokeWidth: 1.9 }), HOME_ITEM.label, () => router.push(HOME_ITEM.path), () => prefetch(HOME_ITEM.path))}
      {centerGroups.map((g) => (
        <Dropdown key={g.key} trigger={['hover', 'click']} menu={{ items: g.visible.map((i: any) => ({ key: i.path, label: itemLabel(i) })), onClick: ({ key }) => router.push(navTarget(key)) }}>
          {Pill(groupActive(g.visible), createElement(g.icon as any, { size: 20, strokeWidth: 1.9 }), g.label, undefined, () => prefetchGroup(g.visible))}
        </Dropdown>
      ))}
      {analyticsVisible && Pill(pathname === ANALYTICS_ITEM.path, createElement(ANALYTICS_ITEM.icon!, { size: 20, strokeWidth: 1.9 }), ANALYTICS_ITEM.label, () => router.push(ANALYTICS_ITEM.path), () => prefetch(ANALYTICS_ITEM.path))}
    </div>
  );
}
