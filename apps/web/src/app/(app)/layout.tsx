'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Layout, Menu, Spin, Tooltip, Typography } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { createElement } from 'react';
import { NAV_GROUPS } from '@/lib/nav';
import { useAuth, useAuthStore } from '@/lib/auth';
import { refreshSession } from '@/lib/api';

const { Header, Sider, Content } = Layout;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { claims, hydrated, isAuthed, stale, can } = useAuth();
  const clear = useAuthStore((s) => s.clear);
  const [collapsed, setCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Client-side auth guard (tokens live in localStorage, hydrated after mount).
  useEffect(() => {
    if (hydrated && !isAuthed) router.replace('/login');
  }, [hydrated, isAuthed, router]);

  // A token whose claims predate a permissions-model change must NOT be used to
  // render the nav (it would silently hide sections the user actually has). Force
  // a silent refresh to re-issue a token with current claims; if that fails,
  // send the user to a clean re-login rather than showing an empty app.
  useEffect(() => {
    if (hydrated && isAuthed && stale && !refreshing) {
      setRefreshing(true);
      refreshSession()
        .then((ok) => {
          if (!ok) {
            clear();
            router.replace('/login');
          }
        })
        .finally(() => setRefreshing(false));
    }
  }, [hydrated, isAuthed, stale, refreshing, clear, router]);

  // Build the menu from nav config, dropping items the user can't view and
  // then any group left empty.
  const menuItems = useMemo(
    () =>
      NAV_GROUPS.map((group) => {
        const items = group.items.filter((i) => can(i.permission));
        if (items.length === 0) return null;
        return {
          key: group.key,
          label: group.label,
          icon: createElement(group.icon),
          children: items.map((i) => ({ key: i.path, label: i.label })),
        };
      }).filter(Boolean) as NonNullable<unknown>[],
    [claims], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const openKeys = useMemo(() => NAV_GROUPS.map((g) => g.key), []);

  // While unauthenticated, hydrating, or refreshing a stale token, show a
  // spinner — never the nav computed from a stale/absent token.
  if (!hydrated || !isAuthed || stale || refreshing) {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', gap: 12 }}>
        <Spin size="large" />
        {(stale || refreshing) && <Typography.Text type="secondary">Updating your session…</Typography.Text>}
      </div>
    );
  }

  const logout = () => {
    clear();
    router.replace('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light" width={220}>
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: collapsed ? 14 : 20,
            color: '#0e7490',
          }}
        >
          {collapsed ? 'CL' : 'Cytolab'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[pathname]}
          defaultOpenKeys={openKeys}
          items={menuItems as any}
          onClick={({ key }) => router.push(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 16,
            paddingInline: 24,
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Typography.Text type="secondary">{claims?.email}</Typography.Text>
          <Tooltip title="Sign out">
            <Button icon={<LogoutOutlined />} onClick={logout}>
              Logout
            </Button>
          </Tooltip>
        </Header>
        <Content style={{ margin: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
