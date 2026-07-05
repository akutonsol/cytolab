'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import {
  ALERT_TYPE_LABEL,
  SEVERITY_STYLE,
  fmtDateTime,
  relTime,
  securityApi,
} from '@/lib/security';
import { Badge, Card, KpiCard, SecurityPage, Table } from '@/components/security/ui';

export default function SecurityDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['security-dashboard'], queryFn: securityApi.dashboard, refetchInterval: 30_000 });
  const k = data?.kpis;

  return (
    <SecurityPage title="Security Dashboard" subtitle="Live overview of authentication, access, and threats" icon={<ShieldCheck size={20} />}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Active Sessions" value={k?.activeSessions ?? '—'} />
        <KpiCard label="Failed Logins (24h)" value={k?.failedLogins24h ?? '—'} tone={k && k.failedLogins24h > 0 ? 'warning' : 'default'} />
        <KpiCard label="Locked Accounts" value={k?.lockedAccounts ?? '—'} tone={k && k.lockedAccounts > 0 ? 'danger' : 'default'} />
        <KpiCard label="Open Alerts" value={k?.openAlerts ?? '—'} tone={k && k.openAlerts > 0 ? 'danger' : 'ok'} />
        <KpiCard label="Blocked IPs" value={k?.blockedIps ?? '—'} />
        <KpiCard label="After-hours (24h)" value={k?.afterHours ?? '—'} hint="Logins 10pm–6am" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Recent security alerts">
            <Table
              rows={data?.recentAlerts ?? []}
              loading={isLoading}
              rowKey={(a) => a.id}
              empty="No alerts — all clear."
              columns={[
                {
                  key: 'sev', header: 'Severity', render: (a) => (
                    <Badge {...SEVERITY_STYLE[a.severity]}>{a.severity}</Badge>
                  ),
                },
                { key: 'type', header: 'Type', render: (a) => ALERT_TYPE_LABEL[a.type] ?? a.type },
                { key: 'title', header: 'Detail', render: (a) => <span className="text-slate-800">{a.title}</span> },
                { key: 'when', header: 'When', render: (a) => <span className="text-slate-500">{relTime(a.createdAt)}</span> },
              ]}
            />
          </Card>
        </div>
        <Card title="Logins by country (24h)">
          <div className="p-4">
            {(data?.loginsByCountry ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No successful logins yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {data!.loginsByCountry.slice(0, 10).map((c) => {
                  const max = data!.loginsByCountry[0].count || 1;
                  return (
                    <li key={c.country} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-sm font-medium text-slate-700">{c.country}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(c.count / max) * 100}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-sm text-slate-500">{c.count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Recent login activity">
          <Table
            rows={data?.recentLogins ?? []}
            loading={isLoading}
            rowKey={(l) => l.id}
            empty="No recent logins."
            columns={[
              { key: 'time', header: 'Time', render: (l) => <span className="text-slate-500">{fmtDateTime(l.createdAt)}</span> },
              { key: 'email', header: 'Account', render: (l) => l.email ?? '—' },
              { key: 'ip', header: 'IP', render: (l) => <span className="font-mono text-xs">{l.ipAddress}</span> },
              { key: 'loc', header: 'Location', render: (l) => [l.city, l.country].filter(Boolean).join(', ') || '—' },
              {
                key: 'ok', header: 'Result', render: (l) =>
                  l.success ? <Badge bg="#F0FDF4" color="#16A34A">Success</Badge> : <Badge bg="#FEF2F2" color="#DC2626">Failed</Badge>,
              },
            ]}
          />
        </Card>
      </div>
    </SecurityPage>
  );
}
