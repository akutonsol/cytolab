'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Drawer, Dropdown, Grid, Menu, Spin, Typography } from 'antd';
import {
  BellOutlined, DownOutlined, LogoutOutlined, MenuOutlined, MessageOutlined,
  ReadOutlined, SearchOutlined, SettingOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Megaphone, Microscope, Mic, ShieldAlert, ToggleRight, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useDictationContext } from '@/lib/dictation-context';
import { ACCOUNT_GROUP_KEY, ANALYTICS_ITEM, HOME_ITEM, NAV_GROUPS } from '@/lib/nav';
import { useFeatures } from '@/lib/feature-context';
import { NavPills } from '@/components/dashboard/nav-pills';
import { ClockWidget } from '@/components/workforce/ClockWidget';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { useAuth, useAuthStore } from '@/lib/auth';
import { api, refreshSession } from '@/lib/api';

interface Announcement { id: string; title: string; body: string; type: string }
// Announcement banner palette (zero-orange: WARNING uses amber #A16207).
const ANN_BANNER: Record<string, { bg: string; border: string; fg: string }> = {
  INFO: { bg: '#EFF6FF', border: '#BFDBFE', fg: '#1D4ED8' },
  WARNING: { bg: '#FFFBEB', border: '#FDE68A', fg: '#A16207' },
  CRITICAL: { bg: '#FEF2F2', border: '#FECACA', fg: '#DC2626' },
};

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

  // Active system announcements → slim dismissible banner below the nav.
  const { data: announcements = [] } = useQuery({
    queryKey: ['active-announcements'],
    queryFn: () => api.get('/system/support/announcements/active').then((r) => r.data as Announcement[]),
    enabled: isAuthed,
    refetchInterval: 300_000,
  });
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    try { setDismissed(JSON.parse(sessionStorage.getItem('dismissed-announcements') || '[]')); } catch { /* ignore */ }
  }, []);
  const dismissAnnouncement = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { sessionStorage.setItem('dismissed-announcements', JSON.stringify(next)); } catch { /* ignore */ }
  };
  const visibleAnnouncements = announcements.filter((a) => !dismissed.includes(a.id));
  // Real first name for the "Hi, …" greeting (JWT claims carry no name).
  const { data: profile } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () =>
      api.get('/auth/me').then(
        (r) => r.data as { firstName?: string; mfaRequired?: boolean; mfaEnabled?: boolean },
      ),
    enabled: isAuthed,
    staleTime: 5 * 60_000,
  });
  // Persistent nag: the account must use MFA but hasn't set it up yet.
  const mfaSetupNeeded = !!profile?.mfaRequired && !profile?.mfaEnabled;
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
  const securityGroup = NAV_GROUPS.find((g) => g.key === 'security');
  const securityItems = securityGroup ? securityGroup.items.filter(navVisible) : [];

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

  // Revoke the server session + clear the auth cookies (best-effort), then drop
  // local claims and return to /login.
  const logout = () => {
    api.post('/auth/logout').catch(() => {}).finally(() => { clear(); router.replace('/login'); });
  };
  const initials = (claims?.email ?? '?').slice(0, 2).toUpperCase();
  const localPart = (claims?.email ?? '').split('@')[0];
  const firstName = ((localPart.split(/[._-]/)[0] || 'there').replace(/[^a-z]/gi, '') || 'there').replace(/^\w/, (c) => c.toUpperCase());
  // Prefer the real profile first name for the greeting; fall back while it loads.
  const greetingName = profile?.firstName?.trim() || firstName;
  const role = claims?.roles?.[0] ?? 'User';

  // Account (avatar) dropdown: email header + admin/platform sections + Settings + Sign out.
  const accountMenu: MenuProps = {
    items: [
      { key: 'who', label: <span style={{ color: '#9ca3af', fontSize: 12 }}>{claims?.email}</span>, disabled: true },
      { type: 'divider' },
      ...accountItems.map((i) => ({ key: i.path, label: i.label, icon: i.path === '/settings' ? <SettingOutlined /> : undefined })),
      ...(securityItems.length
        ? [
            { type: 'divider' as const },
            { key: 'security-label', label: <span style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Security</span>, disabled: true },
            ...securityItems.map((i) => ({ key: i.path, label: i.label, icon: <ShieldAlert size={15} /> })),
          ]
        : []),
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

  const showCenter = !!screens.lg; // user pill + pills row below the logo above lg; hamburger below

  // User profile: avatar + name + role + chevron, flush on the nav background
  // (no card/shadow). Sits on the left of row 2 on desktop; folded into the
  // row-1 right controls on mobile.
  const accountButton = (
    <Dropdown trigger={['click']} menu={accountMenu} placement="bottomLeft">
      <button aria-label="Account" className="flex items-center gap-2.5 cursor-pointer border-0 bg-transparent p-0">
        <span className="relative inline-flex">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{initials}</span>
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
        </span>
        {screens.sm && (
          <span className="text-left leading-tight">
            <span className="block text-sm font-medium text-gray-800">{firstName}</span>
            <span className="block text-xs text-gray-400">{role}</span>
          </span>
        )}
        <DownOutlined className="text-gray-400" style={{ fontSize: 11 }} />
      </button>
    </Dropdown>
  );

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', background: CANVAS, display: 'flex', flexDirection: 'column' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap');`}</style>

      <header style={heroZone}>
        <div style={heroBg(showCenter)}>
          {/* ROW 1 — logo + subtitle (left), search + action icons (right).
              zIndex kept above the pills row so the clock dropdown overlays them. */}
          <div style={{ position: 'relative', zIndex: 40, display: 'flex', alignItems: 'center', gap: 16, minHeight: 44 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!showCenter && <button aria-label="Menu" onClick={() => setDrawerOpen(true)} className={iconBtnCls}><MenuOutlined /></button>}
              <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 11, background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', color: '#fff', boxShadow: '0 6px 16px rgba(79,70,229,0.3)', flexShrink: 0 }}>
                <Microscope size={20} strokeWidth={1.9} />
              </span>
              <div style={{ lineHeight: 1.1 }}>
                <div style={{ fontFamily: 'Geist, sans-serif', fontSize: 20, fontWeight: 700, letterSpacing: 0.6, color: '#111827' }}>CYTOLAB</div>
                {screens.sm && <div style={{ fontSize: 12, color: '#111827', marginTop: 1 }}>Cytology &amp; Pathology Laboratory System</div>}
              </div>
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, width: 360, borderRadius: 999, padding: '0 14px', border: '1px solid #e5e7eb', background: '#fff', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
                  <SearchOutlined style={{ color: '#9ca3af', fontSize: 16 }} />
                  <input placeholder="Search cases, patients, reports…" onFocus={() => router.push('/search')} onChange={(e) => router.push(`/search?q=${encodeURIComponent(e.target.value)}`)} style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: 14, color: '#111827' }} />
                </div>
              )}
              {screens.md && <ClockWidget nav />}
              {quickAdd.items && quickAdd.items.length > 0 && (
                <Dropdown trigger={['click']} menu={quickAdd}><button aria-label="Quick add" className={iconBtnCls}><ReadOutlined /></button></Dropdown>
              )}
              <button aria-label="Messages" onClick={() => navigate('/messaging')} className={iconBtnCls}><MessageOutlined /></button>
              <button aria-label="Notifications" onClick={() => router.push('/notifications')} className={`${iconBtnCls} relative`}>
                <BellOutlined />
                {unread > 0 && (
                  <span style={{ position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 999, background: '#EF4444', color: 'white', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              <ThemeSwitcher triggerStyle={iconBtnStyle} />
              <button aria-label="Settings" onClick={() => router.push('/settings')} className={iconBtnCls}><SettingOutlined /></button>
              {!showCenter && accountButton}
            </div>
          </div>

          {/* ROW 2 — user pill + greeting (left) + nav pills (right), desktop only. */}
          {showCenter && (
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {accountButton}
                <div className="ml-3 leading-tight">
                  <div className="text-lg text-gray-400">Hi, {greetingName}!</div>
                  <div className="text-xl font-bold text-gray-900">Welcome Back</div>
                </div>
              </div>
              <NavPills justify="flex-end" />
            </div>
          )}
        </div>
      </header>

      {/* MFA required but not configured — persistent (non-dismissible) banner. */}
      {mfaSetupNeeded && (
        <div style={{ position: 'relative', zIndex: 15, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#EEF2FF', borderTop: '1px solid #C7D2FE', borderBottom: '1px solid #C7D2FE' }}>
          <ShieldAlert size={16} style={{ color: '#4338CA', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#4338CA' }}>
            <span style={{ fontWeight: 700 }}>Your account requires two-factor authentication.</span>
            <span style={{ marginLeft: 8, opacity: 0.9 }}>Set it up to keep access to your lab.</span>
          </span>
          <button onClick={() => router.push('/profile/security')} style={{ marginLeft: 'auto', border: 'none', background: '#4F46E5', color: '#fff', fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}>
            Set up MFA
          </button>
        </div>
      )}

      {/* Active system announcements — slim, dismissible per session. */}
      {visibleAnnouncements.map((a) => {
        const c = ANN_BANNER[a.type] ?? ANN_BANNER.INFO;
        return (
          <div key={a.id} style={{ position: 'relative', zIndex: 15, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: c.bg, borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
            <Megaphone size={16} style={{ color: c.fg, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: c.fg }}>
              <span style={{ fontWeight: 700 }}>{a.title}</span>
              {a.body ? <span style={{ marginLeft: 8, opacity: 0.9 }}>{a.body}</span> : null}
            </span>
            <button aria-label="Dismiss" onClick={() => dismissAnnouncement(a.id)} style={{ marginLeft: 'auto', display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 999, border: 'none', background: 'transparent', color: c.fg, cursor: 'pointer', flexShrink: 0 }}><X size={15} /></button>
          </div>
        );
      })}

      <main className="premium-scroll" style={{ position: 'relative', zIndex: 1, flex: 1, overflow: 'auto', padding: 16, background: 'var(--color-bg-main)' }}>{children}</main>

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
const CANVAS = '#f3f4f8';
const heroZone: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 20 };
const heroBg = (tall: boolean): React.CSSProperties => ({
  position: 'relative', background: '#f3f4f8',
  padding: tall ? '10px 16px 4px' : '8px 16px', minHeight: tall ? 96 : 56,
});
// Clean circular icon buttons: no border/fill until hovered.
const iconBtnCls = 'grid h-10 w-10 place-items-center rounded-full border-0 bg-transparent text-lg text-gray-500 cursor-pointer transition-colors hover:bg-gray-100';
// Inline equivalent for the ThemeSwitcher trigger (it only takes a style prop).
const iconBtnStyle: React.CSSProperties = { display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 999, border: 'none', background: 'transparent', color: '#6b7280', fontSize: 18, cursor: 'pointer' };
