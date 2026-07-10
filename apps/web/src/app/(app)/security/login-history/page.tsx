'use client';

import { useCallback, useRef, useState } from 'react';
import { History, Search } from 'lucide-react';
import { Badge, SecurityPage, Table } from '@/components/security/ui';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { fmtDateTime, securityApi, type LoginAttempt } from '@/lib/security';

const inputCls = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400';

export default function LoginHistoryPage() {
  const [email, setEmail] = useState('');
  const [ip, setIp] = useState('');
  const [success, setSuccess] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<Record<string, string | undefined>>({});

  // The endpoint returns the whole (server-filtered, capped) list; fetch it once
  // per applied-filter set and window it client-side for infinite scroll.
  const cacheRef = useRef<{ key: string; all: LoginAttempt[] } | null>(null);
  const fetchFn = useCallback(
    async (page: number, pageSize: number) => {
      const key = JSON.stringify(applied);
      if (!cacheRef.current || cacheRef.current.key !== key) {
        cacheRef.current = { key, all: await securityApi.loginAttempts(applied) };
      }
      return clientPage(cacheRef.current.all, page, pageSize);
    },
    [applied],
  );
  const { items, loading, initialLoading, hasMore, sentinelRef } =
    useInfiniteScroll<LoginAttempt>({ fetchFn, pageSize: 20 });

  const apply = () =>
    setApplied({
      email: email || undefined,
      ip: ip || undefined,
      success: success || undefined,
      from: from || undefined,
      to: to || undefined,
    });

  return (
    <SecurityPage title="Login History" subtitle="Every authentication attempt, successful or failed" icon={<History size={20} />} back="/security">
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <input className={inputCls} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inputCls} placeholder="IP address" value={ip} onChange={(e) => setIp(e.target.value)} />
        <select className={inputCls} value={success} onChange={(e) => setSuccess(e.target.value)}>
          <option value="">All results</option>
          <option value="true">Success</option>
          <option value="false">Failed</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">From<input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">To<input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button onClick={apply} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">
          <Search size={15} /> Search
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <Table<LoginAttempt>
          rows={items}
          loading={initialLoading}
          rowKey={(l) => l.id}
          empty="No login attempts match."
          columns={[
            { key: 'time', header: 'Time', render: (l) => <span className="text-slate-500">{fmtDateTime(l.createdAt)}</span> },
            { key: 'email', header: 'Account', render: (l) => l.email ?? '—' },
            { key: 'ip', header: 'IP', render: (l) => <span className="font-mono text-xs">{l.ipAddress}</span> },
            { key: 'loc', header: 'Location', render: (l) => [l.city, l.country].filter(Boolean).join(', ') || '—' },
            { key: 'ua', header: 'Browser / OS', render: (l) => [l.browser, l.os].filter(Boolean).join(' · ') || '—' },
            {
              key: 'result', header: 'Result', render: (l) =>
                l.success
                  ? <Badge size="sm" tone="success-strong">Success</Badge>
                  : <Badge size="sm" tone="danger-strong">{l.failReason ?? 'Failed'}</Badge>,
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
