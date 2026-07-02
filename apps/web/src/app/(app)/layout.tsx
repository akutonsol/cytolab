'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Drawer, Dropdown, Grid, Menu, Spin, Typography } from 'antd';
import {
  BellOutlined, DownOutlined, LogoutOutlined, MenuOutlined, PlusOutlined,
  SearchOutlined, SettingOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { ACCOUNT_GROUP_KEY, ANALYTICS_ITEM, CENTER_GROUP_KEYS, HOME_ITEM, NAV_GROUPS } from '@/lib/nav';
import { useAuth, useAuthStore } from '@/lib/auth';
import { refreshSession } from '@/lib/api';

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: '#4F46E5', display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0 }}>
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
          return { key: group.key, label: group.label, icon: createElement(group.icon, { size: 16 }), children: items.map((i) => ({ key: i.path, label: i.label })) };
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
  const localPart = (claims?.email ?? '').split('@')[0];
  const firstName = ((localPart.split(/[._-]/)[0] || 'there').replace(/[^a-z]/gi, '') || 'there').replace(/^\w/, (c) => c.toUpperCase());
  const role = claims?.roles?.[0] ?? 'User';

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

  const showCenter = !!screens.lg; // hero pills + greeting above lg; hamburger below

  const pill = (active: boolean, icon: React.ReactNode, label: string, chevron: boolean, onClick?: () => void) => (
    <button className={active ? 'cyto-pill cyto-pill-active' : 'cyto-pill'} onClick={onClick} style={navPill(active)}>
      <span style={{ display: 'inline-flex', fontSize: 15 }}>{icon}</span>
      <span>{label}</span>
      {chevron && <DownOutlined style={{ fontSize: 10, opacity: 0.7 }} />}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', background: CANVAS, display: 'flex', flexDirection: 'column' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap');
.cyto-pill{transition:all .18s cubic-bezier(0.4,0,0.2,1)}
.cyto-pill:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(79,70,229,0.18)}
.cyto-pill:not(.cyto-pill-active):hover{background:rgba(79,70,229,0.08) !important;border-color:#c7d2fe !important}`}</style>

      <header style={heroZone}>
        <div style={heroBg(showCenter)}>
          {/* ROW 1 — identity / title / actions */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 16, minHeight: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!showCenter && <button aria-label="Menu" onClick={() => setDrawerOpen(true)} style={iconBtnHero}><MenuOutlined /></button>}
              <Dropdown trigger={['click']} menu={accountMenu} placement="bottomLeft">
                <button aria-label="Account" style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e6e9f2', cursor: 'pointer', padding: '5px 8px 5px 5px', borderRadius: 999, boxShadow: '0 2px 6px rgba(16,24,40,0.06)' }}>
                  <span style={avatarBtn}>{initials}</span>
                  {screens.sm && (
                    <span style={{ textAlign: 'left', lineHeight: 1.2 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#111827' }}>{firstName}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#8a93a6' }}>{role}</span>
                    </span>
                  )}
                  <span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 999, background: '#f2f4fa', color: '#6b7280' }}><DownOutlined style={{ fontSize: 10 }} /></span>
                </button>
              </Dropdown>
            </div>

            <div style={{ position: 'absolute', left: '50%', top: 4, transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontFamily: 'Geist, sans-serif', fontSize: 25, fontWeight: 700, letterSpacing: 1, color: '#111827' }}>CYTOLAB</div>
              {screens.md && <div style={{ fontSize: 13, color: '#8a93a6', marginTop: 2 }}>Cytology &amp; Pathology Laboratory System</div>}
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              {screens.md && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 46, width: 260, background: '#fff', border: '1px solid #d1d9ee', borderRadius: 999, padding: '0 16px', color: '#9ca3af' }}>
                  <SearchOutlined />
                  <input placeholder="Search…" style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: 14, color: '#111827' }} />
                </div>
              )}
              {quickAdd.items && quickAdd.items.length > 0 && (
                <Dropdown trigger={['click']} menu={quickAdd}><button aria-label="Quick add" style={iconBtnHero}><PlusOutlined /></button></Dropdown>
              )}
              <button aria-label="Notifications" style={iconBtnHero}><BellOutlined /></button>
              <button aria-label="Settings" onClick={() => router.push('/settings')} style={iconBtnHero}><SettingOutlined /></button>
            </div>
          </div>

          {/* ROW 2 — nav pills (desktop only). The dashboard hides these because it
              renders its own pills beside the greeting (matches the reference). */}
          {showCenter && pathname !== '/dashboard' && (
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', marginTop: 12 }}>
              <nav style={navPillBar}>
                {can(HOME_ITEM.permission) && pill(pathname === HOME_ITEM.path, createElement(HOME_ITEM.icon!, { size: 15, strokeWidth: 1.5 }), HOME_ITEM.label, false, () => navigate(HOME_ITEM.path))}
                {centerGroups.map((g) => (
                  <Dropdown key={g.key} trigger={['hover', 'click']} menu={{ items: g.visible.map((i: any) => ({ key: i.path, label: i.label })), onClick: ({ key }) => navigate(key) }}>
                    {pill(groupActive(g.visible), createElement(g.icon as any, { size: 15, strokeWidth: 1.5 }), g.label, true)}
                  </Dropdown>
                ))}
                {analyticsVisible && pill(pathname === ANALYTICS_ITEM.path, createElement(ANALYTICS_ITEM.icon!, { size: 15, strokeWidth: 1.5 }), ANALYTICS_ITEM.label, false, () => navigate(ANALYTICS_ITEM.path))}
              </nav>
            </div>
          )}
        </div>
      </header>

      <main className="premium-scroll" style={{ position: 'relative', zIndex: 1, flex: 1, overflow: 'auto', padding: screens.md ? 32 : 16, background: 'transparent' }}>{children}</main>

      <Drawer title={<Logo />} placement="left" width={300} open={drawerOpen} onClose={() => setDrawerOpen(false)} styles={{ body: { padding: 0 } }}>
        <Menu mode="inline" selectedKeys={[pathname]} defaultOpenKeys={NAV_GROUPS.map((g) => g.key)} items={drawerMenu} onClick={({ key }) => navigate(key)} style={{ borderInlineEnd: 'none' }} />
      </Drawer>
    </div>
  );
}

// Soft blue-gray → lavender canvas; the whole app is one seamless surface.
const CANVAS = 'linear-gradient(160deg, #edf0f6 0%, #e7eaf3 58%, #eae8f5 100%)';
const heroZone: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 20 };
const heroBg = (tall: boolean): React.CSSProperties => ({
  position: 'relative', background: 'transparent',
  padding: tall ? '14px 32px 12px' : '10px 16px', minHeight: tall ? 108 : 64,
});
const navPillBar: React.CSSProperties = {
  display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 16,
  padding: '8px 12px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
};
const navPill = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
  fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
  border: '1px solid ' + (active ? 'transparent' : '#e2e8f0'),
  background: active ? 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' : '#fff',
  color: active ? '#fff' : '#374151',
  boxShadow: active ? '0 4px 12px rgba(79,70,229,0.28)' : 'none',
});
const iconBtnHero: React.CSSProperties = { width: 44, height: 44, borderRadius: 999, border: '1px solid #d1d9ee', background: '#fff', color: '#6b7280', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 17 };
const avatarBtn: React.CSSProperties = { width: 38, height: 38, borderRadius: 999, border: 'none', background: '#4F46E5', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600 };
