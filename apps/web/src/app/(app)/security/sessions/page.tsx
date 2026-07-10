'use client';

import { useCallback, useRef, useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { message, Popconfirm } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { fmtDateTime, fullName, relTime, securityApi, type UserSession } from '@/lib/security';
import { SecurityPage, Table, dangerBtn } from '@/components/security/ui';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { notify } from '@/lib/notify';

export default function SecuritySessionsPage() {
  // Sessions are returned as a whole array; fetch once and window client-side.
  // Bumping `refreshKey` (after a terminate) busts the cache and reloads.
  const [refreshKey, setRefreshKey] = useState(0);
  const cacheRef = useRef<{ key: number; all: UserSession[] } | null>(null);
  const fetchFn = useCallback(
    async (page: number, pageSize: number) => {
      if (!cacheRef.current || cacheRef.current.key !== refreshKey) {
        cacheRef.current = { key: refreshKey, all: await securityApi.sessions() };
      }
      return clientPage(cacheRef.current.all, page, pageSize);
    },
    [refreshKey],
  );
  const { items, loading, initialLoading, hasMore, sentinelRef } =
    useInfiniteScroll<UserSession>({ fetchFn, pageSize: 20 });
  const reload = () => setRefreshKey((k) => k + 1);

  const terminate = useMutation({
    mutationFn: (id: string) => securityApi.terminateSession(id),
    onSuccess: () => { notify.success('Session terminated'); reload(); },
    onError: () => notify.error('Could not terminate session'),
  });
  const terminateAll = useMutation({
    mutationFn: (userId: string) => securityApi.terminateAllForUser(userId),
    onSuccess: () => { notify.success('All sessions terminated for user'); reload(); },
    onError: () => notify.error('Could not terminate sessions'),
  });

  return (
    <SecurityPage title="Active Sessions" subtitle="Every live device session across the platform" icon={<MonitorSmartphone size={20} />} back="/security">
      <div className="rounded-2xl border border-slate-200 bg-white">
        <Table<UserSession>
          rows={items}
          loading={initialLoading}
          rowKey={(s) => s.id}
          empty="No active sessions."
          columns={[
            { key: 'user', header: 'User', render: (s) => <span className="font-medium text-slate-800">{fullName(s.user)}</span> },
            { key: 'device', header: 'Device', render: (s) => s.deviceName ?? ([s.browser, s.os].filter(Boolean).join(' · ') || '—') },
            { key: 'ip', header: 'IP', render: (s) => <span className="font-mono text-xs">{s.ipAddress}</span> },
            { key: 'loc', header: 'Location', render: (s) => [s.city, s.country].filter(Boolean).join(', ') || '—' },
            { key: 'active', header: 'Last active', render: (s) => relTime(s.lastActiveAt) },
            { key: 'login', header: 'Signed in', render: (s) => <span className="text-slate-500">{fmtDateTime(s.createdAt)}</span> },
            {
              key: 'act', header: '', render: (s) => (
                <div className="flex justify-end gap-2">
                  <Popconfirm title="Terminate this session?" onConfirm={() => terminate.mutate(s.id)} okText="Terminate" okButtonProps={{ danger: true }}>
                    <button className={dangerBtn}>Terminate</button>
                  </Popconfirm>
                  <Popconfirm title="Terminate ALL sessions for this user?" onConfirm={() => terminateAll.mutate(s.userId)} okText="Terminate all" okButtonProps={{ danger: true }}>
                    <button className={dangerBtn}>All for user</button>
                  </Popconfirm>
                </div>
              ),
            },
          ]}
        />
        {items.length > 0 && (
          <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
        )}
      </div>
    </SecurityPage>
  );
}
