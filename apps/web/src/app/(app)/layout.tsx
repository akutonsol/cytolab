'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Drawer, Dropdown, Grid, Menu, Spin, Tooltip, Typography } from 'antd';
import {
  BellOutlined, DownOutlined, LogoutOutlined, MenuOutlined, PlusOutlined, SearchOutlined, SettingOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { ACCOUNT_GROUP_KEY, ANALYTICS_ITEM, CENTER_GROUP_KEYS, HOME_ITEM, NAV_GROUPS } from '@/lib/nav';
import { useAuth, useAuthStore } from '@/lib/auth';
import { refreshSession } from '@/lib/api';

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: '#4f7df9', display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3z" fill="currentColor" opacity="0.25" />
          <path d="M10 6.5v7M6.5 10h7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </div>
      <span style={{ fontWeight: 700, fontSize: 18, color: '#111827' }}>Cytolab</span>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { claims, hydrated, isAuthed, stale, can } = useAuth();
  const clear = useAuthStore((s) => s.clear);
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const screens = Grid.useBreakpoint();

  useEffect(() => { if (hydrated && !isAuthed) router.replace('/login'); }, [hydrated, isAuthed, router]);
  useEffect(() => {
    if (hydrated && isAuthed && stale && !refreshing) {
      setRefreshing(true);
      refreshSession().then((ok) => { if (!ok) { clear(); router.replace('/login'); } }).finally(() => setRefreshing(false));
    }
  }, [hydrated, isAuthed, stale, refreshing, clear, router]);

  const navigate = (key: string) => { setDrawerOpen(false); router.push(key); };

  // Center dropdown groups (permission-filtered; group hidden when it has no items).
  const centerGroups = useMemo(
    () =>
      CENTER_GROUP_KEYS.map((k) => NAV_GROUPS.find((g) => g.key === k))
        .filter(Boolean)
        .map((g) => ({ ...(g as any), visible: (g as any).items.filter((i: any) => can(i.permission)) }))
        .filter((g) => g.visible.length > 0),
    [claims], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const analyticsVisible = can(ANALYTICS_ITEM.permission);
  const accountGroup = NAV_GROUPS.find((g) => g.key === ACCOUNT_GROUP_KEY)!;
  const accountItems = accountGroup.items.filter((i) => can(i.permission));

  const groupActive = (items: any[]) => items.some((i: any) => i.path === pathname);

  // Full grouped menu (used in the mobile drawer).
  const drawerMenu: MenuProps['items'] = useMemo(
    () =>
      [
        can(HOME_ITEM.permission) ? { key: HOME_ITEM.path, label: HOME_ITEM.label } : null,
        ...NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => can(i.permission));
          if (!items.length) return null;
          return { key: group.key, label: group.label, icon: createElement(group.icon), children: items.map((i) => ({ key: i.path, label: i.label })) };
        }).filter(Boolean),
        analyticsVisible ? { key: ANALYTICS_ITEM.path, label: ANALYTICS_ITEM.label } : null,
      ].filter(Boolean) as MenuProps['items'],
    [claims], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!hydrated || !isAuthed || stale || refreshing) {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', gap: 12 }}>
        <Spin size="large" />
        {(stale || refreshing) && <Typography.Text type="secondary">Updating your session…</Typography.Text>}
      </div>
    );
  }

  const logout = () => { clear(); router.replace('/login'); };
  const initials = (claims?.email ?? '?').slice(0, 2).toUpperCase();

  // Account (avatar) dropdown: email header + admin/platform sections + Settings + Sign out.
  const accountMenu: MenuProps = {
    items: [
      { key: 'who', label: <span style={{ color: '#9ca3af', fontSize: 12 }}>{claims?.email}</span>, disabled: true },
      { type: 'divider' },
      ...accountItems.map((i) => ({ key: i.path, label: i.label, icon: i.path === '/settings' ? <SettingOutlined /> : undefined })),
      ...(accountItems.length ? [{ type: 'divider' as const }] : []),
      { key: 'logout', label: 'Sign out', icon: <LogoutOutlined />, danger: true },
    ],
    onClick: ({ key }) => (key === 'logout' ? logout() : navigate(key)),
  };

  const quickAdd: MenuProps = {
    items: [
      { key: '/patients', label: 'New patient' },
      { key: '/requisitions', label: 'New requisition' },
      { key: '/records', label: 'New record' },
    ].filter((i) => can(NAV_GROUPS.flatMap((g) => g.items).find((x) => x.path === i.key)?.permission)),
    onClick: ({ key }) => navigate(key),
  };

  const showCenter = screens.lg; // hamburger below lg

  return (
    <div style={{ minHeight: '100vh', background: '#f6f8fc', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 20, background: '#fff', padding: '12px 32px', borderBottom: '1px solid #edf2f7', position: 'sticky', top: 0, zIndex: 20 }}>
        {!showCenter && (
          <button aria-label="Menu" onClick={() => setDrawerOpen(true)} style={iconBtn}><MenuOutlined /></button>
        )}
        <Logo />

        {showCenter && (
          <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {can(HOME_ITEM.permission) && (
              <button onClick={() => navigate(HOME_ITEM.path)} style={navBtn(pathname === HOME_ITEM.path)}>
                {HOME_ITEM.label}
                {pathname === HOME_ITEM.path && <span style={underline} />}
              </button>
            )}
            {centerGroups.map((g) => {
              const active = groupActive(g.visible);
              return (
                <Dropdown key={g.key} trigger={['hover', 'click']} menu={{ items: g.visible.map((i: any) => ({ key: i.path, label: i.label })), onClick: ({ key }) => navigate(key) }}>
                  <button style={navBtn(active)}>
                    {g.label} <DownOutlined style={{ fontSize: 10 }} />
                    {active && <span style={underline} />}
                  </button>
                </Dropdown>
              );
            })}
            {analyticsVisible && (
              <button onClick={() => navigate(ANALYTICS_ITEM.path)} style={navBtn(pathname === ANALYTICS_ITEM.path)}>
                {ANALYTICS_ITEM.label}
                {pathname === ANALYTICS_ITEM.path && <span style={underline} />}
              </button>
            )}
          </nav>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {screens.md && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48, width: 280, background: '#f7f8fc', borderRadius: 18, padding: '0 16px', color: '#9ca3af' }}>
              <SearchOutlined />
              <input placeholder="Quick search" style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: 14, color: '#111827' }} />
            </div>
          )}
          {quickAdd.items && quickAdd.items.length > 0 && (
            <Dropdown trigger={['click']} menu={quickAdd}><button aria-label="Quick add" style={iconBtn}><PlusOutlined /></button></Dropdown>
          )}
          <button aria-label="Notifications" style={iconBtn}><BellOutlined /></button>
          <Dropdown trigger={['click']} menu={accountMenu} placement="bottomRight">
            <button aria-label="Account" style={{ ...avatarBtn }}>{initials}</button>
          </Dropdown>
        </div>
      </header>

      <main className="premium-scroll" style={{ flex: 1, overflow: 'auto', padding: screens.md ? 32 : 16 }}>{children}</main>

      <Drawer title={<Logo />} placement="left" width={300} open={drawerOpen} onClose={() => setDrawerOpen(false)} styles={{ body: { padding: 0 } }}>
        <Menu mode="inline" selectedKeys={[pathname]} defaultOpenKeys={NAV_GROUPS.map((g) => g.key)} items={drawerMenu} onClick={({ key }) => navigate(key)} style={{ borderInlineEnd: 'none' }} />
      </Drawer>
    </div>
  );
}

const navBtn = (active: boolean): React.CSSProperties => ({
  position: 'relative', border: 'none', background: 'transparent', cursor: 'pointer',
  padding: '8px 14px', fontSize: 15, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
  color: active ? '#4f7df9' : '#6b7280',
});
const underline: React.CSSProperties = { position: 'absolute', left: 14, right: 14, bottom: -13, height: 2, background: '#4f7df9', borderRadius: 2 };
const iconBtn: React.CSSProperties = { width: 40, height: 40, borderRadius: 999, border: '1px solid #edf2f7', background: '#fff', color: '#6b7280', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 16 };
const avatarBtn: React.CSSProperties = { width: 40, height: 40, borderRadius: 999, border: 'none', background: '#4f7df9', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600 };
