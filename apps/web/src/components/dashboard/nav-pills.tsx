'use client';

import { createElement } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Dropdown } from 'antd';
import { ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ANALYTICS_ITEM, CENTER_GROUP_KEYS, HOME_ITEM, NAV_GROUPS } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import { api } from '@/lib/api';

const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 10, padding: '7px 9px', borderRadius: 999,
  fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', border: '1px solid #e5e3dc',
  background: '#fff', color: '#374151', boxShadow: '0 2px 6px rgba(16,24,40,0.06)',
};
const pillActive: React.CSSProperties = {
  ...pill, border: '1px solid transparent', color: '#ffffff',
  background: 'var(--color-primary)', boxShadow: '0 8px 18px rgba(16,24,40,0.18)',
};
const iconBox = (active: boolean): React.CSSProperties => ({
  display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: active ? 999 : 11, flexShrink: 0,
  background: active ? '#fff' : '#f1f0ea', color: active ? 'var(--color-primary)' : '#4b5563',
});
const chevBox = (active: boolean): React.CSSProperties => ({
  display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 999, flexShrink: 0,
  background: active ? '#fff' : '#e5e3dc', color: active ? 'var(--color-primary)' : '#4b5563',
});

/**
 * Dashboard hero nav — the same permission-filtered navigation as the app top
 * bar, rendered as pills beside the greeting (matches the reference: icon in a
 * rounded square, chevron in a circle, soft-lavender active state). On the
 * dashboard the layout hides its own pill row so this is the only copy.
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

  const Pill = (isActive: boolean, icon: React.ReactNode, label: string, chevron: boolean, onClick?: () => void) => (
    <button className="cyto-hero-pill" onClick={onClick} style={isActive ? pillActive : pill}>
      <span style={iconBox(isActive)}>{icon}</span>
      <span style={{ padding: '0 2px' }}>{label}</span>
      {chevron ? <span style={chevBox(isActive)}><ChevronDown size={14} /></span> : <span style={{ width: 4 }} />}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: justify }}>
      <style>{`.cyto-hero-pill{transition:transform .18s cubic-bezier(0.4,0,0.2,1),box-shadow .18s}.cyto-hero-pill:hover{transform:translateY(-1px)}`}</style>
      {can(HOME_ITEM.permission) && Pill(pathname === HOME_ITEM.path, createElement(HOME_ITEM.icon!, { size: 16, strokeWidth: 1.9 }), HOME_ITEM.label, true, () => router.push(HOME_ITEM.path))}
      {centerGroups.map((g) => (
        <Dropdown key={g.key} trigger={['hover', 'click']} menu={{ items: g.visible.map((i: any) => ({ key: i.path, label: itemLabel(i) })), onClick: ({ key }) => router.push(key) }}>
          {Pill(groupActive(g.visible), createElement(g.icon as any, { size: 16, strokeWidth: 1.9 }), g.label, true)}
        </Dropdown>
      ))}
      {analyticsVisible && Pill(pathname === ANALYTICS_ITEM.path, createElement(ANALYTICS_ITEM.icon!, { size: 16, strokeWidth: 1.9 }), ANALYTICS_ITEM.label, true, () => router.push(ANALYTICS_ITEM.path))}
    </div>
  );
}
