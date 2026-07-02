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

// Large vibrant blue→purple DNA double-helix hero graphic (glowing, diagonal,
// edge-faded, gently floating) — the signature element from the reference.
function DnaWatermark() {
  const W = 760, H = 260, mid = H / 2, amp = 78, periods = 3.6, N = 110;
  const strand = (phase: number) =>
    Array.from({ length: N }, (_, i) => {
      const x = (i / (N - 1)) * W;
      const y = mid + amp * Math.sin((i / (N - 1)) * periods * 2 * Math.PI + phase);
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  const rungs = Array.from({ length: 30 }, (_, i) => {
    const t = (i + 0.5) / 30;
    const x = t * W;
    const a = t * periods * 2 * Math.PI;
    return { x, y1: mid + amp * Math.sin(a), y2: mid + amp * Math.sin(a + Math.PI), k: i };
  });
  return (
    <div style={{
      position: 'absolute', right: -70, top: -26, width: W, height: H, transform: 'rotate(-14deg)',
      opacity: 0.9, pointerEvents: 'none', zIndex: 1,
      WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 22%, #000 82%, transparent 100%)',
      maskImage: 'linear-gradient(90deg, transparent 0%, #000 22%, #000 82%, transparent 100%)',
    }}>
      <div className="hero-dna-float">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
          <defs>
            <linearGradient id="dnaGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="38%" stopColor="#6366F1" />
              <stop offset="72%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>
            <filter id="dnaGlow" x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g filter="url(#dnaGlow)">
            {rungs.map((r) => <line key={r.k} x1={r.x} y1={r.y1} x2={r.x} y2={r.y2} stroke="url(#dnaGrad)" strokeWidth={2} strokeLinecap="round" opacity={0.45} />)}
            <path d={strand(0)} stroke="url(#dnaGrad)" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.5} />
            <path d={strand(Math.PI)} stroke="url(#dnaGrad)" strokeWidth={5.5} strokeLinecap="round" fill="none" />
            {rungs.map((r) => (
              <g key={`n${r.k}`}>
                <circle cx={r.x} cy={r.y1} r={5} fill="url(#dnaGrad)" opacity={0.6} />
                <circle cx={r.x} cy={r.y2} r={5} fill="url(#dnaGrad)" />
              </g>
            ))}
          </g>
        </svg>
      </div>
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
    <div style={{ minHeight: '100vh', background: '#f6f8fc', display: 'flex', flexDirection: 'column' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap');
.cyto-pill{transition:all .18s cubic-bezier(0.4,0,0.2,1)}
.cyto-pill:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(79,70,229,0.18)}
.cyto-pill:not(.cyto-pill-active):hover{background:rgba(79,70,229,0.08) !important;border-color:#c7d2fe !important}
@keyframes heroDnaFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
.hero-dna-float{animation:heroDnaFloat 7s ease-in-out infinite}`}</style>

      <header style={heroZone}>
        <div style={heroBg(showCenter)}>
          {showCenter && <DnaWatermark />}

          {/* ROW 1 — identity / title / actions */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 16, minHeight: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!showCenter && <button aria-label="Menu" onClick={() => setDrawerOpen(true)} style={iconBtnHero}><MenuOutlined /></button>}
              <Dropdown trigger={['click']} menu={accountMenu} placement="bottomLeft">
                <button aria-label="Account" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 12 }}>
                  <span style={avatarBtn}>{initials}</span>
                  {screens.sm && (
                    <span style={{ textAlign: 'left', lineHeight: 1.2 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#111827' }}>{firstName}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#8a93a6' }}>{role}</span>
                    </span>
                  )}
                  <DownOutlined style={{ fontSize: 10, color: '#8a93a6' }} />
                </button>
              </Dropdown>
            </div>

            <div style={{ position: 'absolute', left: '50%', top: 4, transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontFamily: 'Geist, sans-serif', fontSize: 18, fontWeight: 700, letterSpacing: 1.5, color: '#111827' }}>CYTOLAB</div>
              {screens.md && <div style={{ fontSize: 11, color: '#8a93a6' }}>Cytology &amp; Pathology Laboratory System</div>}
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              {screens.md && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, width: 220, background: '#fff', border: '1px solid #d1d9ee', borderRadius: 999, padding: '0 14px', color: '#9ca3af' }}>
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

          {/* ROW 2 + 3 — greeting + nav pills (desktop only) */}
          {showCenter && (
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'flex-end', gap: 24, marginTop: 12 }}>
              <div style={{ minWidth: 210, flexShrink: 0 }}>
                <div style={{ fontFamily: 'Geist, sans-serif', fontSize: 14, fontWeight: 400, color: '#6b7280' }}>Hi, {firstName}!</div>
                <div style={{ fontFamily: 'Geist, sans-serif', fontSize: 32, fontWeight: 700, letterSpacing: '-0.015em', color: '#111827', lineHeight: 1.05 }}>Welcome Back</div>
              </div>
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

      <main className="premium-scroll" style={{ flex: 1, overflow: 'auto', padding: screens.md ? 32 : 16, background: 'radial-gradient(1200px 520px at 15% -8%, #e9f0fd 0%, rgba(233,240,253,0) 60%), radial-gradient(1100px 480px at 100% 0%, #eef0fb 0%, rgba(238,240,251,0) 55%), linear-gradient(180deg, #f4f7fc 0%, #eef2f9 100%)' }}>{children}</main>

      <Drawer title={<Logo />} placement="left" width={300} open={drawerOpen} onClose={() => setDrawerOpen(false)} styles={{ body: { padding: 0 } }}>
        <Menu mode="inline" selectedKeys={[pathname]} defaultOpenKeys={NAV_GROUPS.map((g) => g.key)} items={drawerMenu} onClick={({ key }) => navigate(key)} style={{ borderInlineEnd: 'none' }} />
      </Drawer>
    </div>
  );
}

const heroZone: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 20 };
const heroBg = (tall: boolean): React.CSSProperties => ({
  position: 'relative', overflow: 'hidden', background: '#edf1f7', borderBottom: '1px solid #dbe2f0',
  padding: tall ? '14px 32px 20px' : '10px 16px', minHeight: tall ? 208 : 64,
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
const iconBtnHero: React.CSSProperties = { width: 40, height: 40, borderRadius: 999, border: '1px solid #d1d9ee', background: '#fff', color: '#6b7280', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 16 };
const avatarBtn: React.CSSProperties = { width: 40, height: 40, borderRadius: 999, border: 'none', background: '#4F46E5', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600 };
