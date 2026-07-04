'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Drawer, Dropdown, Grid, Menu, Spin, Typography } from 'antd';
import {
  BellOutlined, DownOutlined, LogoutOutlined, MenuOutlined, MessageOutlined,
  ReadOutlined, SearchOutlined, SettingOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Microscope, Mic, ToggleRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useDictationContext } from '@/lib/dictation-context';
import { ACCOUNT_GROUP_KEY, ANALYTICS_ITEM, HOME_ITEM, NAV_GROUPS } from '@/lib/nav';
import { useFeatures } from '@/lib/feature-context';
import { NavPills } from '@/components/dashboard/nav-pills';
import { useAuth, useAuthStore } from '@/lib/auth';
import { api, refreshSession } from '@/lib/api';

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
  const { isAnyDictationActive } = useDictationContext();
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Live unread-notification count for the bell badge (polls every 30s).
  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data.count as number),
    refetchInterval: 30_000,
    enabled: isAuthed && can('notification:view'),
  });
  const screens = Grid.useBreakpoint();

  useEffect(() => { if (hydrated && !isAuthed) router.replace('/login'); }, [hydrated, isAuthed, router]);
  useEffect(() => {
    if (hydrated && isAuthed && stale && !refreshing) {
      setRefreshing(true);
      refreshSession().then((ok) => { if (!ok) { clear(); router.replace('/login'); } }).finally(() => setRefreshing(false));
    }
  }, [hydrated, isAuthed, stale, refreshing, clear, router]);

  const navigate = (key: string) => { setDrawerOpen(false); router.push(key); };

  const { isEnabled } = useFeatures();
  // A nav item shows when its permission is held AND (if feature-gated) the
  // feature is enabled for the lab.
  const navVisible = (i: { permission?: string; feature?: string }) =>
    can(i.permission) && (!i.feature || isEnabled(i.feature as any));

  const analyticsVisible = can(ANALYTICS_ITEM.permission);
  const accountGroup = NAV_GROUPS.find((g) => g.key === ACCOUNT_GROUP_KEY)!;
  const accountItems = accountGroup.items.filter(navVisible);
  const superGroup = NAV_GROUPS.find((g) => g.key === 'superuser');
  const superItems = superGroup ? superGroup.items.filter(navVisible) : [];

  // Full grouped menu (used in the mobile drawer).
  const drawerMenu: MenuProps['items'] = useMemo(
    () =>
      [
        can(HOME_ITEM.permission) ? { key: HOME_ITEM.path, label: HOME_ITEM.label } : null,
        ...NAV_GROUPS.map((group) => {
          const items = group.items.filter(navVisible);
          if (!items.length) return null;
          return { key: group.key, label: group.label, icon: createElement(group.icon, { size: 16 }), children: items.map((i) => ({ key: i.path, label: i.label })) };
        }).filter(Boolean),
        analyticsVisible ? { key: ANALYTICS_ITEM.path, label: ANALYTICS_ITEM.label } : null,
      ].filter(Boolean) as MenuProps['items'],
    [claims, isEnabled], // eslint-disable-line react-hooks/exhaustive-deps
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
      ...(superItems.length
        ? [
            { type: 'divider' as const },
            { key: 'superuser-label', label: <span style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Superuser</span>, disabled: true },
            ...superItems.map((i) => ({ key: i.path, label: i.label, icon: <ToggleRight size={15} /> })),
          ]
        : []),
      { type: 'divider' as const },
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

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', background: CANVAS, display: 'flex', flexDirection: 'column' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap');`}</style>

      <header style={heroZone}>
        <div style={heroBg(showCenter)}>
          {/* ROW 1 — identity / title / actions */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 16, minHeight: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!showCenter && <button aria-label="Menu" onClick={() => setDrawerOpen(true)} style={iconBtnHero}><MenuOutlined /></button>}
              <Dropdown trigger={['click']} menu={accountMenu} placement="bottomLeft">
                <button aria-label="Account" style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e6e9f2', cursor: 'pointer', padding: '5px 8px 5px 5px', borderRadius: 999, boxShadow: '0 2px 6px rgba(16,24,40,0.06)' }}>
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <span style={avatarBtn}>{initials}</span>
                    <span style={{ position: 'absolute', right: 0, bottom: 1, width: 11, height: 11, borderRadius: 999, background: '#22c55e', border: '2px solid #fff' }} />
                  </span>
                  {screens.sm && (
                    <span style={{ textAlign: 'left', lineHeight: 1.2 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#111827' }}>{firstName}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#8a93a6' }}>{role}</span>
                    </span>
                  )}
                  <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 999, background: '#eaecf1', color: '#6b7280' }}><DownOutlined style={{ fontSize: 11 }} /></span>
                </button>
              </Dropdown>
            </div>

            <div style={{ position: 'absolute', left: '50%', top: 2, transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 11, background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', color: '#fff', boxShadow: '0 6px 16px rgba(79,70,229,0.3)' }}>
                  <Microscope size={21} strokeWidth={1.9} />
                </span>
                <span style={{ fontFamily: 'Geist, sans-serif', fontSize: 25, fontWeight: 700, letterSpacing: 1, color: '#111827' }}>CYTOLAB</span>
              </div>
              {screens.md && <div style={{ fontSize: 13, color: '#8a93a6', marginTop: 3 }}>Cytology &amp; Pathology Laboratory System</div>}
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              {isAnyDictationActive && (
                <div title="Dictation active" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 12px', borderRadius: 999, background: '#EEF2FF', color: '#4F46E5', fontSize: 13, fontWeight: 600 }}>
                  <span style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
                    <Mic size={16} />
                    <span className="animate-pulse" style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: 999, background: '#EF4444' }} />
                  </span>
                  {screens.md && <span>Listening…</span>}
                </div>
              )}
              {screens.md && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 52, width: 300, borderRadius: 999, padding: '0 8px', color: '#9ca3af', border: '2px solid transparent', background: 'linear-gradient(#fff,#fff) padding-box, linear-gradient(135deg,#d3d9e6 0%,#aeb9d0 100%) border-box', boxShadow: '0 2px 6px rgba(16,24,40,0.05)' }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 999, background: '#d8dde9', color: '#5b6472', flexShrink: 0 }}><SearchOutlined /></span>
                  <input placeholder="Search…" onFocus={() => router.push('/search')} onChange={(e) => router.push(`/search?q=${encodeURIComponent(e.target.value)}`)} style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: 14, color: '#111827' }} />
                </div>
              )}
              {quickAdd.items && quickAdd.items.length > 0 && (
                <Dropdown trigger={['click']} menu={quickAdd}><button aria-label="Quick add" style={iconBtnHero}><ReadOutlined /></button></Dropdown>
              )}
              <button aria-label="Messages" onClick={() => navigate('/messaging')} style={iconBtnHero}><MessageOutlined /></button>
              <button aria-label="Notifications" onClick={() => router.push('/notifications')} style={{ ...iconBtnHero, position: 'relative' }}>
                <BellOutlined />
                {unread > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 999, background: '#EF4444', color: 'white', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              <button aria-label="Settings" onClick={() => router.push('/settings')} style={iconBtnHero}><SettingOutlined /></button>
            </div>
          </div>

          {/* ROW 2 — nav pills (desktop only). The dashboard hides these because it
              renders its own pills beside the greeting (matches the reference). */}
          {showCenter && pathname !== '/dashboard' && (
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <NavPills justify="flex-end" />
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
// Single shared canvas colour painted once on the outermost container. The top
// bar and every page's content are transparent over it, so they're all exactly
// this colour with no seam.
const CANVAS = '#dce3ee';
const heroZone: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 20 };
const heroBg = (tall: boolean): React.CSSProperties => ({
  position: 'relative', background: 'transparent',
  padding: tall ? '14px 32px 12px' : '10px 16px', minHeight: tall ? 108 : 64,
});
const iconBtnHero: React.CSSProperties = { width: 50, height: 50, borderRadius: 999, border: '1px solid #bcc6d9', background: 'linear-gradient(145deg, #e4e9f3 0%, #cbd3e2 100%)', color: '#4b5563', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 18, boxShadow: '0 2px 6px rgba(16,24,40,0.06)' };
const avatarBtn: React.CSSProperties = { width: 42, height: 42, borderRadius: 999, border: 'none', background: '#4F46E5', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 600 };
