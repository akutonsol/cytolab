'use client';

import { createElement } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Dropdown } from 'antd';
import { ChevronDown } from 'lucide-react';
import { ANALYTICS_ITEM, CENTER_GROUP_KEYS, HOME_ITEM, NAV_GROUPS } from '@/lib/nav';
import { useAuth } from '@/lib/auth';

const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 999,
  fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', border: '1px solid #eceef5',
  background: '#fff', color: '#374151', boxShadow: '0 2px 6px rgba(16,24,40,0.06)',
};
const pillActive: React.CSSProperties = {
  ...pill, border: '1px solid transparent', color: '#312e81',
  background: 'linear-gradient(135deg, #c7d2fe 0%, #ddd6fe 100%)', boxShadow: '0 6px 16px rgba(129,140,248,0.35)',
};
const iconBox = (active: boolean): React.CSSProperties => ({
  display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, flexShrink: 0,
  background: active ? '#fff' : '#f2f4fa', color: active ? '#4f46e5' : '#4b5563',
});
const chevBox = (active: boolean): React.CSSProperties => ({
  display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 999, flexShrink: 0,
  background: active ? 'rgba(255,255,255,0.6)' : '#f2f4fa', color: active ? '#4f46e5' : '#6b7280',
});

/**
 * Dashboard hero nav — the same permission-filtered navigation as the app top
 * bar, rendered as pills beside the greeting (matches the reference: icon in a
 * rounded square, chevron in a circle, soft-lavender active state). On the
 * dashboard the layout hides its own pill row so this is the only copy.
 */
export function NavPills() {
  const router = useRouter();
  const pathname = usePathname();
  const { can } = useAuth();

  const centerGroups = CENTER_GROUP_KEYS.map((k) => NAV_GROUPS.find((g) => g.key === k))
    .filter(Boolean)
    .map((g) => ({ ...(g as any), visible: (g as any).items.filter((i: any) => can(i.permission)) }))
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
      <style>{`.cyto-hero-pill{transition:transform .18s cubic-bezier(0.4,0,0.2,1),box-shadow .18s}.cyto-hero-pill:hover{transform:translateY(-1px)}`}</style>
      {can(HOME_ITEM.permission) && Pill(pathname === HOME_ITEM.path, createElement(HOME_ITEM.icon!, { size: 16, strokeWidth: 1.9 }), HOME_ITEM.label, false, () => router.push(HOME_ITEM.path))}
      {centerGroups.map((g) => (
        <Dropdown key={g.key} trigger={['hover', 'click']} menu={{ items: g.visible.map((i: any) => ({ key: i.path, label: i.label })), onClick: ({ key }) => router.push(key) }}>
          {Pill(groupActive(g.visible), createElement(g.icon as any, { size: 16, strokeWidth: 1.9 }), g.label, true)}
        </Dropdown>
      ))}
      {analyticsVisible && Pill(pathname === ANALYTICS_ITEM.path, createElement(ANALYTICS_ITEM.icon!, { size: 16, strokeWidth: 1.9 }), ANALYTICS_ITEM.label, false, () => router.push(ANALYTICS_ITEM.path))}
    </div>
  );
}
