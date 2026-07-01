'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Layout, Menu, Spin, Tooltip, Typography } from 'antd';
import { BellOutlined, LogoutOutlined, SearchOutlined } from '@ant-design/icons';
import { NAV_GROUPS } from '@/lib/nav';
import { useAuth, useAuthStore } from '@/lib/auth';
import { refreshSession } from '@/lib/api';

const { Header, Sider, Content } = Layout;

// Routes that use the horizontal top-nav (Modo-style) instead of the sidebar.
const TOP_NAV_ROUTES = new Set(['/analytics']);

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: '#4f7df9', display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3z" fill="currentColor" opacity="0.25" />
          <path d="M10 6.5v7M6.5 10h7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </div>
      {!compact && <span style={{ fontWeight: 700, fontSize: 18, color: '#111827' }}>Cytolab</span>}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { claims, hydrated, isAuthed, stale, can } = useAuth();
  const clear = useAuthStore((s) => s.clear);
  const [collapsed, setCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Restore persisted collapse state after mount.
  useEffect(() => {
    if (typeof window !== 'undefined') setCollapsed(localStorage.getItem('cytolab-nav-collapsed') === '1');
  }, []);
  const toggleCollapsed = (c: boolean) => {
    setCollapsed(c);
    if (typeof window !== 'undefined') localStorage.setItem('cytolab-nav-collapsed', c ? '1' : '0');
  };

  useEffect(() => {
    if (hydrated && !isAuthed) router.replace('/login');
  }, [hydrated, isAuthed, router]);

  useEffect(() => {
    if (hydrated && isAuthed && stale && !refreshing) {
      setRefreshing(true);
      refreshSession()
        .then((ok) => { if (!ok) { clear(); router.replace('/login'); } })
        .finally(() => setRefreshing(false));
    }
  }, [hydrated, isAuthed, stale, refreshing, clear, router]);

  const menuItems = useMemo(
    () =>
      NAV_GROUPS.map((group) => {
        const items = group.items.filter((i) => can(i.permission));
        if (items.length === 0) return null;
        return { key: group.key, label: group.label, icon: createElement(group.icon), children: items.map((i) => ({ key: i.path, label: i.label })) };
      }).filter(Boolean) as NonNullable<unknown>[],
    [claims], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Top-nav links: one per accessible group → its first item.
  const topLinks = useMemo(
    () =>
      NAV_GROUPS.map((g) => {
        const items = g.items.filter((i) => can(i.permission));
        return items.length ? { key: g.key, label: g.label, path: items[0].path, paths: items.map((i) => i.path) } : null;
      }).filter(Boolean) as { key: string; label: string; path: string; paths: string[] }[],
    [claims], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const activeGroup = NAV_GROUPS.find((g) => g.items.some((i) => i.path === pathname))?.key;

  const openKeys = useMemo(() => NAV_GROUPS.map((g) => g.key), []);

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

  // ---- Top-nav variant (Analytics) ----
  if (TOP_NAV_ROUTES.has(pathname)) {
    return (
      <div style={{ minHeight: '100vh', background: '#f6f8fc', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 32, background: '#fff', padding: '12px 32px', borderBottom: '1px solid #edf2f7' }}>
          <Logo />
          <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {topLinks.map((l) => {
              const active = l.key === activeGroup;
              return (
                <button
                  key={l.key}
                  onClick={() => router.push(l.path)}
                  style={{
                    position: 'relative', border: 'none', background: 'transparent', cursor: 'pointer',
                    padding: '8px 14px', fontSize: 15, fontWeight: 600,
                    color: active ? '#4f7df9' : '#6b7280',
                  }}
                >
                  {l.label}
                  {active && <span style={{ position: 'absolute', left: 14, right: 14, bottom: -13, height: 2, background: '#4f7df9', borderRadius: 2 }} />}
                </button>
              );
            })}
          </nav>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, width: 280, background: '#f7f8fc', borderRadius: 18, padding: '0 16px', color: '#9ca3af' }}>
              <SearchOutlined />
              <input placeholder="Quick search" style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: 14, color: '#111827' }} />
            </div>
            <button className="grid-place" style={btnCircle}><BellOutlined /></button>
            <Tooltip title={claims?.email}><div style={{ ...avatarCircle }}>{initials}</div></Tooltip>
            <Tooltip title="Sign out"><button onClick={logout} style={btnCircle}><LogoutOutlined /></button></Tooltip>
          </div>
        </header>
        <main className="premium-scroll" style={{ flex: 1, overflow: 'auto', padding: 32 }}>{children}</main>
      </div>
    );
  }

  // ---- Default: collapsible sidebar ----
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={toggleCollapsed} theme="light" width={280} collapsedWidth={88}
        style={{ borderRight: '1px solid #edf2f7' }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', paddingInline: collapsed ? 0 : 20, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <Logo compact={collapsed} />
        </div>
        <Menu mode="inline" selectedKeys={[pathname]} defaultOpenKeys={openKeys} items={menuItems as any} onClick={({ key }) => router.push(key)} style={{ borderInlineEnd: 'none' }} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16, paddingInline: 24, borderBottom: '1px solid #edf2f7' }}>
          <Typography.Text type="secondary">{claims?.email}</Typography.Text>
          <Tooltip title="Sign out"><Button icon={<LogoutOutlined />} onClick={logout}>Logout</Button></Tooltip>
        </Header>
        <Content style={{ margin: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}

const btnCircle: React.CSSProperties = { width: 40, height: 40, borderRadius: 999, border: '1px solid #edf2f7', background: '#fff', color: '#6b7280', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 16 };
const avatarCircle: React.CSSProperties = { width: 40, height: 40, borderRadius: 999, background: '#4f7df9', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600 };
