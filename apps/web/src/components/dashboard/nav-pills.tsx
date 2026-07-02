'use client';

import { createElement } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Dropdown } from 'antd';
import { ChevronDown } from 'lucide-react';
import { ANALYTICS_ITEM, CENTER_GROUP_KEYS, HOME_ITEM, NAV_GROUPS } from '@/lib/nav';
import { useAuth } from '@/lib/auth';

const base: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999,
  fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', border: '1px solid #e6e9f2',
  background: '#fff', color: '#374151', boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
};
const active: React.CSSProperties = {
  ...base, border: '1px solid transparent', color: '#fff',
  background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', boxShadow: '0 6px 16px rgba(79,70,229,0.3)',
};

/**
 * Dashboard hero nav — the same permission-filtered navigation as the app top
 * bar, rendered as pills that sit beside the greeting (matches the reference).
 * On the dashboard the layout hides its own pill row so this is the only copy.
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

  const pill = (isActive: boolean, icon: React.ReactNode, label: string, chevron: boolean, onClick?: () => void) => (
    <button className="cyto-hero-pill" onClick={onClick} style={isActive ? active : base}>
      <span style={{ display: 'inline-flex' }}>{icon}</span>
      <span>{label}</span>
      {chevron && <ChevronDown size={13} style={{ opacity: 0.7 }} />}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', maxWidth: 560 }}>
      <style>{`.cyto-hero-pill{transition:transform .18s cubic-bezier(0.4,0,0.2,1),box-shadow .18s}.cyto-hero-pill:hover{transform:translateY(-1px)}`}</style>
      {can(HOME_ITEM.permission) && pill(pathname === HOME_ITEM.path, createElement(HOME_ITEM.icon!, { size: 15, strokeWidth: 1.75 }), HOME_ITEM.label, false, () => router.push(HOME_ITEM.path))}
      {centerGroups.map((g) => (
        <Dropdown key={g.key} trigger={['hover', 'click']} menu={{ items: g.visible.map((i: any) => ({ key: i.path, label: i.label })), onClick: ({ key }) => router.push(key) }}>
          {pill(groupActive(g.visible), createElement(g.icon as any, { size: 15, strokeWidth: 1.75 }), g.label, true)}
        </Dropdown>
      ))}
      {analyticsVisible && pill(pathname === ANALYTICS_ITEM.path, createElement(ANALYTICS_ITEM.icon!, { size: 15, strokeWidth: 1.75 }), ANALYTICS_ITEM.label, false, () => router.push(ANALYTICS_ITEM.path))}
    </div>
  );
}
