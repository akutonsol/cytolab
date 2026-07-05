'use client';

import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { message, Popconfirm } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, BoolPill, SecurityPage, Table, ghostBtn } from '@/components/security/ui';
import {
  ALERT_TYPE_LABEL,
  SEVERITY_STYLE,
  fmtDateTime,
  securityApi,
  type AlertSeverity,
  type AlertType,
  type SecurityAlert,
} from '@/lib/security';

const inputCls = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400';
const TYPES: AlertType[] = ['IMPOSSIBLE_TRAVEL', 'BRUTE_FORCE', 'CREDENTIAL_STUFFING', 'SUSPICIOUS_IP', 'AFTER_HOURS', 'MASS_EXPORT'];
const SEVERITIES: AlertSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export default function SecurityAlertsPage() {
  const qc = useQueryClient();
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [resolved, setResolved] = useState('');
  const params = { type: type || undefined, severity: severity || undefined, resolved: resolved || undefined };

  const { data = [], isLoading } = useQuery({ queryKey: ['security-alerts', params], queryFn: () => securityApi.alerts(params) });
  const resolve = useMutation({
    mutationFn: (id: string) => securityApi.resolveAlert(id),
    onSuccess: () => { message.success('Alert resolved'); qc.invalidateQueries({ queryKey: ['security-alerts'] }); },
    onError: () => message.error('Could not resolve'),
  });

  return (
    <SecurityPage title="Security Alerts" subtitle="Detected threats and anomalies" icon={<BellRing size={20} />} back="/security">
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{ALERT_TYPE_LABEL[t]}</option>)}
        </select>
        <select className={inputCls} value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={inputCls} value={resolved} onChange={(e) => setResolved(e.target.value)}>
          <option value="">All statuses</option>
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
        </select>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <Table<SecurityAlert>
          rows={data}
          loading={isLoading}
          rowKey={(a) => a.id}
          empty="No alerts match."
          columns={[
            { key: 'time', header: 'Time', render: (a) => <span className="text-slate-500">{fmtDateTime(a.createdAt)}</span> },
            { key: 'type', header: 'Type', render: (a) => ALERT_TYPE_LABEL[a.type] ?? a.type },
            { key: 'sev', header: 'Severity', render: (a) => <Badge {...SEVERITY_STYLE[a.severity]}>{a.severity}</Badge> },
            { key: 'detail', header: 'Detail', render: (a) => <div><div className="font-medium text-slate-800">{a.title}</div><div className="text-xs text-slate-500">{a.detail}</div></div> },
            { key: 'ip', header: 'IP', render: (a) => <span className="font-mono text-xs">{a.ipAddress ?? '—'}</span> },
            { key: 'status', header: 'Status', render: (a) => <BoolPill on={a.resolved} onText="Resolved" offText="Open" /> },
            {
              key: 'act', header: '', render: (a) => (
                <div className="flex justify-end">
                  {!a.resolved && (
                    <Popconfirm title="Mark this alert resolved?" onConfirm={() => resolve.mutate(a.id)} okText="Resolve">
                      <button className={ghostBtn}>Resolve</button>
                    </Popconfirm>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    </SecurityPage>
  );
}
