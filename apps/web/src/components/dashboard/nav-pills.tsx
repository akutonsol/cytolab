'use client';

import { createElement, useEffect, useState } from 'react';
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

  // The Quality & Governance and Enterprise Administration workspaces are return-aware surfaces
  // (like Sign-Out): entering one carries an encoded, internal-only `returnTo` = the current route,
  // so its Worklist/back action deterministically restores the source. Every other nav target is
  // pushed as-is. Each workspace re-validates `returnTo` at its trust boundary (safeReturnTo).
  const RETURN_AWARE = ['/quality-governance', '/enterprise-administration'];
  const navTarget = (key: string) => {
    if (!RETURN_AWARE.includes(key) || typeof window === 'undefined') return key;
    const src = window.location.pathname + window.location.search;
    // Omit returnTo when already on the target workspace or on an auth route.
    if (src.startsWith(key) || src.startsWith('/login')) return key;
    return `${key}?returnTo=${encodeURIComponent(src)}`;
  };

  // `extra` carries accessibility props (aria-current on page pills; aria-haspopup/aria-expanded
  // on the group triggers) so the rendered semantics match what each pill actually does.
  const Pill = (
    isActive: boolean,
    icon: React.ReactNode,
    label: string,
    onClick?: () => void,
    onMouseEnter?: () => void,
    extra?: React.ButtonHTMLAttributes<HTMLButtonElement>,
  ) => (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`nav-item whitespace-nowrap text-base font-semibold ${isActive ? 'active text-white' : 'text-gray-700'}`}
      {...extra}
    >
      <span className={`inline-flex ${isActive ? 'text-white' : 'text-indigo-500'}`}>{icon}</span>
      <span>{label}</span>
      {isActive && <span className="ml-1 h-2 w-2 rounded-full bg-white" />}
    </button>
  );

  return (
    <div className="navigation-menu" style={{ flexWrap: 'nowrap', justifyContent: justify }}>
      {can(HOME_ITEM.permission) &&
        Pill(
          pathname === HOME_ITEM.path,
          createElement(HOME_ITEM.icon!, { size: 20, strokeWidth: 1.9 }),
          HOME_ITEM.label,
          () => router.push(HOME_ITEM.path),
          () => prefetch(HOME_ITEM.path),
          { 'aria-current': pathname === HOME_ITEM.path ? 'page' : undefined },
        )}
      {centerGroups.map((g) => (
        <GroupPill
          key={g.key}
          group={g}
          active={groupActive(g.visible)}
          pathname={pathname}
          onOpen={() => prefetchGroup(g.visible)}
          onSelect={(key) => router.push(navTarget(key))}
          renderPill={Pill}
          renderItemLabel={itemLabel}
        />
      ))}
      {analyticsVisible &&
        Pill(
          pathname === ANALYTICS_ITEM.path,
          createElement(ANALYTICS_ITEM.icon!, { size: 20, strokeWidth: 1.9 }),
          ANALYTICS_ITEM.label,
          () => router.push(ANALYTICS_ITEM.path),
          () => prefetch(ANALYTICS_ITEM.path),
          { 'aria-current': pathname === ANALYTICS_ITEM.path ? 'page' : undefined },
        )}
    </div>
  );
}

// A center-nav group pill: a menu trigger, not a page link. Owns the dropdown's open state so
// the trigger can expose truthful `aria-haspopup="menu"` / `aria-expanded`. The active styling
// (a descendant route is the current page) stays visual only — a menu trigger is never the page
// itself, so it carries no `aria-current`.
function GroupPill({
  group,
  active,
  pathname,
  onOpen,
  onSelect,
  renderPill,
  renderItemLabel,
}: {
  group: any;
  active: boolean;
  pathname: string;
  onOpen: () => void;
  onSelect: (key: string) => void;
  renderPill: (
    isActive: boolean,
    icon: React.ReactNode,
    label: string,
    onClick?: () => void,
    onMouseEnter?: () => void,
    extra?: React.ButtonHTMLAttributes<HTMLButtonElement>,
  ) => React.ReactElement;
  renderItemLabel: (i: any) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // The item for the page the user is on stays highlighted (grey, like hover) so they can
  // see where they are. Longest-prefix match so a detail route (/qc/equipment) highlights
  // its own item over a shorter sibling (/qc). Hover behavior is untouched.
  const selectedKey = group.visible
    .filter((i: any) => pathname === i.path || pathname.startsWith(`${i.path}/`))
    .sort((a: any, b: any) => b.path.length - a.path.length)[0]?.path;
  return (
    <Dropdown
      trigger={['hover', 'click']}
      open={open}
      rootClassName="nav-group-menu"
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onOpen();
      }}
      menu={{
        items: group.visible.map((i: any) => ({ key: i.path, label: renderItemLabel(i) })),
        selectedKeys: selectedKey ? [selectedKey] : [],
        onClick: ({ key }: { key: string }) => onSelect(key),
      }}
    >
      {renderPill(active, createElement(group.icon as any, { size: 20, strokeWidth: 1.9 }), group.label, undefined, undefined, {
        'aria-haspopup': 'menu',
        'aria-expanded': open,
      })}
    </Dropdown>
  );
}
