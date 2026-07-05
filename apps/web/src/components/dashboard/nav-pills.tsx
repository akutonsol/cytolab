'use client';

import { createElement } from 'react';
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

  const Pill = (isActive: boolean, icon: React.ReactNode, label: string, onClick?: () => void) => (
    <button
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-full px-5 py-2.5 text-base font-semibold transition-colors ${
        isActive
          ? 'border-0 bg-indigo-600 text-white shadow-sm'
          : 'border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50'
      }`}
    >
      <span className={`inline-flex ${isActive ? 'text-white' : 'text-indigo-500'}`}>{icon}</span>
      <span>{label}</span>
      {isActive && <span className="ml-1 h-2 w-2 rounded-full bg-white" />}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: justify }}>
      {can(HOME_ITEM.permission) && Pill(pathname === HOME_ITEM.path, createElement(HOME_ITEM.icon!, { size: 20, strokeWidth: 1.9 }), HOME_ITEM.label, () => router.push(HOME_ITEM.path))}
      {centerGroups.map((g) => (
        <Dropdown key={g.key} trigger={['hover', 'click']} menu={{ items: g.visible.map((i: any) => ({ key: i.path, label: itemLabel(i) })), onClick: ({ key }) => router.push(key) }}>
          {Pill(groupActive(g.visible), createElement(g.icon as any, { size: 20, strokeWidth: 1.9 }), g.label)}
        </Dropdown>
      ))}
      {analyticsVisible && Pill(pathname === ANALYTICS_ITEM.path, createElement(ANALYTICS_ITEM.icon!, { size: 20, strokeWidth: 1.9 }), ANALYTICS_ITEM.label, () => router.push(ANALYTICS_ITEM.path))}
    </div>
  );
}
