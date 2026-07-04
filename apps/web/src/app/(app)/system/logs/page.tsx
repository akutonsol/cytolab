'use client';

import { useMemo, useState } from 'react';
import { Download, Shield } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────
type Severity = 'info' | 'success' | 'warning' | 'error';
type LogType = 'RECORD_STATUS' | 'AUTH' | 'AUTHORIZATION' | 'CHANGE_REQUEST' | 'PAYMENT' | 'MAINTENANCE';
interface LogEntry {
  id: string;
  type: LogType;
  action: string;
  subject: string;
  userId: string | null;
  userName: string;
  userEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  severity: Severity;
}
interface LogPage { data: LogEntry[]; total: number; page: number; pageSize: number; totalPages: number }

const PAGE_SIZE = 25;

const TYPE_OPTIONS: { value: '' | LogType; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'RECORD_STATUS', label: 'Record Status' },
  { value: 'AUTH', label: 'Auth' },
  { value: 'AUTHORIZATION', label: 'Authorization' },
  { value: 'CHANGE_REQUEST', label: 'Change Request' },
  { value: 'PAYMENT', label: 'Payment' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
];

// Type badge palette (zero orange — all cool/brand hues).
const TYPE_BADGE: Record<LogType, { bg: string; color: string; label: string }> = {
  RECORD_STATUS: { bg: '#EEF2FF', color: '#4F46E5', label: 'Record Status' },
  AUTH: { bg: '#F1F5F9', color: '#64748B', label: 'Auth' },
  AUTHORIZATION: { bg: 'rgba(22,163,74,0.10)', color: '#16A34A', label: 'Authorization' },
  CHANGE_REQUEST: { bg: '#F0F9FF', color: '#0284C7', label: 'Change Request' },
  PAYMENT: { bg: '#F0FDF4', color: '#16A34A', label: 'Payment' },
  MAINTENANCE: { bg: '#F5F3FF', color: '#7C3AED', label: 'Maintenance' },
};

// Severity → left-border accent. Warning is dark amber #B45309 (detector-safe;
// #D97706 would trip the zero-orange rule).
const SEVERITY_BORDER: Record<Severity, string> = {
  error: '#DC2626',
  warning: '#B45309',
  success: '#16A34A',
  info: 'transparent',
};

const AVATAR_TINTS: { bg: string; fg: string }[] = [
  { bg: '#EEF2FF', fg: '#4F46E5' },
  { bg: '#F0FDF4', fg: '#16A34A' },
  { bg: '#FFF1F2', fg: '#E11D48' },
  { bg: '#F0F9FF', fg: '#0284C7' },
  { bg: '#F5F3FF', fg: '#7C3AED' },
];
const tintFor = (s: string) => AVATAR_TINTS[(s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TINTS.length];
const initialsOf = (name: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

const relTime = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};
const fullTime = (iso: string) => new Date(iso).toLocaleString();
const isToday = (iso: string) => { const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };
// Reference-like subjects (lab numbers, bill refs): a letter + a digit, no spaces.
const looksLikeRef = (s: string) => !!s && s !== '—' && !/\s/.test(s) && /[A-Za-z]/.test(s) && /\d/.test(s);

export default function SystemLogPage() {
  const [type, setType] = useState<'' | LogType>('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['system-logs', type, userId, from, to],
    queryFn: () =>
      api
        .get<LogPage>('/system/logs', { params: { pageSize: 1000, ...(type && { type }), ...(userId && { userId }), ...(from && { from }), ...(to && { to: `${to}T23:59:59` }) } })
        .then((r) => r.data),
  });

  const entries = data?.data ?? [];
  const total = data?.total ?? 0;

  // User dropdown options derived from the events themselves.
  const users = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) if (e.userId) map.set(e.userId, e.userName);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  // KPIs across the full filtered set.
  const kpis = useMemo(() => {
    const todays = entries.filter((e) => isToday(e.createdAt));
    const activeUsers = new Set(todays.map((e) => e.userId).filter(Boolean));
    return {
      total,
      today: todays.length,
      alerts: entries.filter((e) => e.severity === 'error' || e.severity === 'warning').length,
      activeUsers: activeUsers.size,
    };
  }, [entries, total]);

  const hasFilters = !!(type || userId || from || to);
  const clearFilters = () => { setType(''); setUserId(''); setFrom(''); setTo(''); setPage(1); };

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = entries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportCsv = () => {
    const header = ['Time', 'Actor', 'Email', 'Action', 'Subject', 'Type', 'Severity'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = entries.map((e) => [fullTime(e.createdAt), e.userName, e.userEmail ?? '', e.action, e.subject, e.type, e.severity].map(esc).join(','));
    const csv = [header.map(esc).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const kpiCards = [
    { label: 'Total Events', value: kpis.total },
    { label: 'Today', value: kpis.today },
    { label: 'Errors / Warnings', value: kpis.alerts },
    { label: 'Users Active Today', value: kpis.activeUsers },
  ];

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="px-6 py-8 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-charcoal-heading">System Log</h1>
            <p className="mt-1 font-body-sm text-body-sm text-secondary">Complete audit trail of all system activity.</p>
          </div>
          <button className="btn-secondary" onClick={exportCsv} disabled={!entries.length}>
            <Download size={16} /> Export CSV
          </button>
        </div>

        {/* Filter bar */}
        <div className="glass-card mb-5 flex flex-wrap items-end gap-3 rounded-2xl p-4">
          <Field label="Type">
            <select value={type} onChange={(e) => { setType(e.target.value as '' | LogType); setPage(1); }} className={selectCls}>
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="User">
            <select value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All users</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="From">
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={selectCls} />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={selectCls} />
          </Field>
          {hasFilters && (
            <button onClick={clearFilters} className="mb-0.5 font-label-sm text-label-sm text-primary hover:underline">Clear filters</button>
          )}
        </div>

        {/* KPI strip */}
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpiCards.map((k) => (
            <div key={k.label} className="glass-card rounded-2xl p-5">
              <div className="font-display text-[30px] font-bold leading-none text-[#0F172A]">{k.value}</div>
              <div className="mt-2 font-label-sm text-label-sm uppercase tracking-wider text-secondary">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Log table */}
        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/40 bg-surface-container-low/40">
                  {['Time', 'Actor', 'Action', 'Subject', 'Type', 'Severity'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-16 text-center font-body-sm text-body-sm text-secondary">Loading…</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Shield size={48} className="text-[#E2E8F0]" />
                        <p className="font-headline-sm text-headline-sm text-charcoal-heading">No log entries found</p>
                        <p className="font-body-sm text-body-sm text-secondary">Try adjusting or clearing your filters.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pageRows.map((e) => {
                    const badge = TYPE_BADGE[e.type];
                    const av = tintFor(e.userName);
                    const isSystem = e.userName === 'System' || e.userName === '—';
                    return (
                      <tr key={e.id} className="border-b border-surface-container-low transition-colors hover:bg-surface-container-low/50" style={{ borderLeft: `3px solid ${SEVERITY_BORDER[e.severity]}` }}>
                        {/* Time */}
                        <td className="px-4 py-3 align-middle" title={fullTime(e.createdAt)}>
                          <span className="whitespace-nowrap font-body-sm text-body-sm text-on-surface">{relTime(e.createdAt)}</span>
                        </td>
                        {/* Actor */}
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-2.5">
                            {isSystem ? (
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-container font-label-sm text-label-sm font-bold text-secondary">SYS</span>
                            ) : (
                              <span style={{ background: av.bg, color: av.fg }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-label-sm text-label-sm font-bold">{initialsOf(e.userName)}</span>
                            )}
                            <div className="min-w-0">
                              <div className={`truncate font-body-sm text-body-sm ${isSystem ? 'text-secondary' : 'text-charcoal-heading'}`}>{e.userName}</div>
                              {e.userEmail && <div className="truncate text-[12px] text-secondary">{e.userEmail}</div>}
                            </div>
                          </div>
                        </td>
                        {/* Action */}
                        <td className="px-4 py-3 align-middle">
                          <span className="font-body-sm text-body-sm text-charcoal-heading">{e.action}</span>
                        </td>
                        {/* Subject */}
                        <td className="px-4 py-3 align-middle">
                          {looksLikeRef(e.subject) ? (
                            <span className="inline-block rounded-md bg-primary-fixed px-2 py-0.5 font-mono text-[13px] text-primary">{e.subject}</span>
                          ) : (
                            <span className="font-body-sm text-body-sm text-secondary">{e.subject}</span>
                          )}
                        </td>
                        {/* Type */}
                        <td className="px-4 py-3 align-middle">
                          <span style={{ background: badge.bg, color: badge.color }} className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium">{badge.label}</span>
                        </td>
                        {/* Severity */}
                        <td className="px-4 py-3 align-middle">
                          <span className="font-label-sm text-label-sm capitalize" style={{ color: e.severity === 'info' ? '#64748B' : SEVERITY_BORDER[e.severity] }}>{e.severity}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {entries.length > 0 && (
            <div className="flex items-center justify-between border-t border-surface-container-low px-4 py-3">
              <span className="font-body-sm text-body-sm text-secondary">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, entries.length)} of {entries.length}
              </span>
              <div className="flex items-center gap-2">
                <button className="btn-secondary !px-3 !py-1.5" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ opacity: safePage <= 1 ? 0.5 : 1 }}>← Prev</button>
                <span className="font-label-sm text-label-sm text-secondary">Page {safePage} of {totalPages}</span>
                <button className="btn-secondary !px-3 !py-1.5" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ opacity: safePage >= totalPages ? 0.5 : 1 }}>Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const selectCls = 'h-10 rounded-xl border border-outline-variant/40 bg-white px-3 font-body-sm text-body-sm text-on-surface outline-none transition-colors focus:border-primary';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-label-sm text-label-sm text-secondary">{label}</label>
      {children}
    </div>
  );
}
