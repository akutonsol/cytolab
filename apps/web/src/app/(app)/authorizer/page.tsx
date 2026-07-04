'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, CheckCheck, CheckCircle2, ClipboardCheck, Clock, Eye, RefreshCw, Search } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { AuthorizationModal } from '@/components/AuthorizationModal';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import { FeatureGate } from '@/components/FeatureGate';

interface Rec {
  id: string;
  labNumber?: string | null;
  formType?: string | null;
  status: string;
  urgent: boolean;
  specimenDate?: string | null;
  createdAt: string;
  patientId?: string | null;
  patient?: { firstName: string; lastName: string; registrationNo?: string | null } | null;
  client?: { firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null } | null;
  specimens?: Array<{ id: string; type: string }>;
  assignedToId?: string | null;
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
}

type Tab = 'awaiting' | 'approved';

// Awaiting Approval = Resulted (a sheet exists, not yet authorized); Approved =
// signed off. Both are read straight from the record status filter.
const TAB_STATUS: Record<Tab, string> = { awaiting: 'Resulted', approved: 'Approved' };

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CARD = 'rounded-[20px] border border-[#EEF2F7] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]';
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const relTime = (d?: string | null) => {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const specLabel = (t?: string) => (t ? t.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '—');
const patientName = (r: Rec) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : '—');
const clientName = (r: Rec) => (r.client ? r.client.officeName || `${r.client.firstName} ${r.client.lastName}`.trim() : '—');

export default function AuthorizerPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('awaiting');
  const [authorizeRec, setAuthorizeRec] = useState<Rec | null>(null);
  const { claims } = useAuth();
  const { isEnabled } = useFeatures();
  const showAssignee = isEnabled('CASE_ASSIGNMENT');
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const toggleBatch = (id: string) => setBatchSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['records', 'authorizer', tab],
    queryFn: () =>
      api
        .get<Paginated<Rec>>('/specimens', { params: { pageSize: 100, status: TAB_STATUS[tab] } })
        .then((r) => r.data),
  });
  const rows: Rec[] = data?.data ?? [];

  // Separate counts for the KPI strip (share cache with the active tab's query).
  const { data: awaitingData } = useQuery({
    queryKey: ['records', 'authorizer', 'awaiting'],
    queryFn: () => api.get<Paginated<Rec>>('/specimens', { params: { pageSize: 100, status: 'Resulted' } }).then((r) => r.data),
  });
  const { data: approvedData } = useQuery({
    queryKey: ['records', 'authorizer', 'approved'],
    queryFn: () => api.get<Paginated<Rec>>('/specimens', { params: { pageSize: 100, status: 'Approved' } }).then((r) => r.data),
  });

  const awaiting = awaitingData?.data ?? [];
  const awaitingUrgent = awaiting.filter((r) => r.urgent).length;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const approvedToday = (approvedData?.data ?? []).filter((r) => new Date(r.createdAt) >= today).length;
  const oldestDays = awaiting.length ? Math.floor((Date.now() - Math.min(...awaiting.map((r) => new Date(r.createdAt).getTime()))) / 86400000) : null;

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => `${r.labNumber ?? ''} ${patientName(r)} ${clientName(r)}`.toLowerCase().includes(q));
  }, [rows, search]);

  const kpis = [
    { icon: ClipboardCheck, label: 'Awaiting Authorization', value: String(awaiting.length), sub: `${awaitingUrgent} urgent`, subColor: awaitingUrgent > 0 ? '#EF4444' : '#94A3B8' },
    { icon: CheckCircle2, label: 'Approved Today', value: String(approvedToday), sub: 'authorized today', subColor: '#94A3B8' },
    { icon: Clock, label: 'Oldest Pending', value: oldestDays != null ? `${oldestDays}d` : '—', sub: 'days waiting', subColor: (oldestDays ?? 0) > 3 ? '#EF4444' : '#94A3B8' },
  ];

  const th = 'px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[#94A3B8]';

  return (
    <div className="min-h-full p-8" style={{ background: '#F8FAFC' }}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>Authorizer Workspace</h1>
          <p className="mt-1.5 text-[14px] text-[#6B7280]">Review and authorize cytology result sheets</p>
        </div>
        <div className="flex items-center gap-3">
          <FeatureGate feature="BATCH_AUTHORIZATION">
            {batchMode && batchSelected.size > 0 && (
              <button onClick={() => router.push(`/batch-authorize?recordIds=${Array.from(batchSelected).join(',')}`)}
                className="flex items-center gap-2 rounded-full bg-[#4F46E5] px-4 py-2 text-[13px] font-semibold text-white">
                <CheckCheck size={16} /> Authorize Selected ({batchSelected.size})
              </button>
            )}
            {tab === 'awaiting' && (
              <button onClick={() => { setBatchMode((v) => !v); setBatchSelected(new Set()); }}
                className="rounded-full px-4 py-2 text-[13px] font-semibold transition-colors"
                style={batchMode ? { background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE' } : { background: '#fff', color: '#64748B', border: '1px solid #E5E7EB' }}>
                Batch Mode {batchMode ? 'On' : 'Off'}
              </button>
            )}
          </FeatureGate>
          <button onClick={() => qc.invalidateQueries({ queryKey: ['records', 'authorizer'] })} title="Refresh" className="grid h-10 w-10 place-items-center rounded-full border border-[#E5E7EB] bg-white text-[#6B7280] transition-colors hover:bg-[#F5F7FF] hover:text-[#4F46E5]">
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <div className="inline-flex gap-1 rounded-full bg-[#F1F5F9] p-1">
            {([['awaiting', 'Awaiting'], ['approved', 'Approved']] as const).map(([v, l]) => (
              <button key={v} onClick={() => { setTab(v); setExpandedId(null); }} className="rounded-full px-5 py-2 transition-colors"
                style={{ background: tab === v ? '#fff' : 'transparent', color: tab === v ? '#0F172A' : '#64748B', fontSize: 13, fontWeight: tab === v ? 700 : 600, boxShadow: tab === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map(({ icon: Icon, label, value, sub, subColor }) => (
          <div key={label} className={`${CARD} flex items-center gap-4 p-5`}>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#EEF2FF]"><Icon size={20} color="#4F46E5" /></div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">{label}</div>
              <div className="mt-0.5 text-[22px] font-extrabold leading-none text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>{value}</div>
              <div className="mt-1 text-[11px] font-semibold" style={{ color: subColor }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Records table */}
      <div className={`${CARD} p-6`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-[#0F172A]">Records · {filtered.length}</h2>
          <div className="flex h-9 w-[240px] items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3.5 text-[#9CA3AF]">
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lab#, patient, client…" className="w-full border-none bg-transparent text-[13px] text-[#0F172A] outline-none placeholder:text-[#9CA3AF]" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <ClipboardCheck size={48} className="text-[#E2E8F0]" />
            <div className="text-[14px] font-medium text-[#94A3B8]">{tab === 'awaiting' ? 'No records awaiting authorization' : 'No authorized records'}</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#F1F5F9]">
                  {batchMode && tab === 'awaiting' && <th className={th} />}
                  <th className={th}>Lab#</th><th className={th}>Patient</th><th className={th}>Client</th>
                  <th className={th}>Form</th><th className={th}>Specimen</th><th className={th}>Date</th>
                  <th className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const expanded = expandedId === r.id;
                  const gyn = r.formType === 'Gynecology';
                  const mine = showAssignee && !!r.assignedToId && r.assignedToId === claims?.userId;
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-[#F8FAFC] transition-colors hover:bg-[#F9FAFB]" style={{ ...(r.urgent ? { boxShadow: 'inset 3px 0 0 0 #EF4444' } : {}), ...((mine || (batchMode && batchSelected.has(r.id))) ? { background: '#EEF2FF' } : {}) }}>
                        {batchMode && tab === 'awaiting' && (
                          <td className="pl-4"><input type="checkbox" checked={batchSelected.has(r.id)} onChange={() => toggleBatch(r.id)} style={{ accentColor: '#4F46E5' }} /></td>
                        )}
                        <td className="px-4 py-3.5">
                          <div className="font-mono text-[14px] font-bold text-[#0F172A]">{r.labNumber ?? '—'}</div>
                          {r.urgent && <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: '#FEF2F2', color: '#DC2626' }}>Urgent</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="text-[14px] font-semibold text-[#0F172A]">{patientName(r)}</div>
                          {r.patient?.registrationNo && <div className="text-[11px] text-[#94A3B8]">{r.patient.registrationNo}</div>}
                          {showAssignee && (
                            <div className="mt-0.5 text-[11px] font-medium" style={{ color: mine ? '#4F46E5' : '#94A3B8' }}>
                              {r.assignedTo ? `${mine ? '★ ' : ''}${r.assignedTo.firstName} ${r.assignedTo.lastName}` : 'Unassigned'}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="text-[14px] text-[#0F172A]">{clientName(r)}</div>
                          {r.client?.accountNo && <div className="text-[11px] text-[#94A3B8]">{r.client.accountNo}</div>}
                        </td>
                        <td className="px-4 py-3.5">
                          {r.formType
                            ? <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={gyn ? { background: '#EEF3FF', color: '#4F46E5' } : { background: '#F0FDF4', color: '#16A34A' }}>{gyn ? 'GYN' : 'NON-GYN'}</span>
                            : <span className="text-[13px] text-[#94A3B8]">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-[11px] text-[#64748B]">{specLabel(r.specimens?.[0]?.type)}</td>
                        <td className="px-4 py-3.5">
                          <div className="text-[13px] text-[#0F172A]">{fmtDate(r.specimenDate ?? r.createdAt)}</div>
                          <div className="text-[11px] text-[#94A3B8]">{relTime(r.createdAt)}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            {tab === 'awaiting' ? (
                              <button onClick={() => setAuthorizeRec(r)} className="flex items-center gap-1.5 rounded-[10px] px-4 py-[7px] text-[13px] font-semibold text-white transition-colors hover:bg-[#4338CA]" style={{ background: '#4F46E5' }}><CheckCircle2 size={15} /> Authorize</button>
                            ) : (
                              <button onClick={() => setAuthorizeRec(r)} className="flex items-center gap-1.5 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#EEF3FF]"><Eye size={15} /> Review</button>
                            )}
                            <button title="View details" onClick={() => setExpandedId(expanded ? null : r.id)} className="grid h-8 w-8 place-items-center rounded-full border border-[#EEF2F7] text-[#6B7280] transition-colors hover:bg-[#F5F7FF] hover:text-[#4F46E5]" style={expanded ? { background: '#EEF2FF', color: '#4F46E5' } : undefined}><Eye size={15} /></button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={batchMode && tab === 'awaiting' ? 8 : 7} style={{ background: '#F8F9FF', padding: '16px 24px' }}>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                              <div>
                                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Patient</div>
                                <div className="text-[14px] font-semibold text-[#0F172A]">{patientName(r)}</div>
                                {r.patient?.registrationNo && <div className="text-[12px] text-[#64748B]">Reg: {r.patient.registrationNo}</div>}
                              </div>
                              <div>
                                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Specimen</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {(r.specimens ?? []).length === 0 ? <span className="text-[13px] text-[#94A3B8]">—</span> : (r.specimens ?? []).map((s) => (
                                    <span key={s.id} className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: '#EEF2FF', color: '#4F46E5' }}>{specLabel(s.type)}</span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Record</div>
                                <div className="text-[13px] text-[#0F172A]">Status: <span className="font-semibold">{r.status}</span></div>
                                <div className="text-[13px] text-[#0F172A]">Form: {r.formType ?? '—'}</div>
                                <div className="text-[13px] text-[#64748B]">Created: {fmtDate(r.createdAt)}</div>
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-4">
                              <button onClick={() => router.push(`/records/${r.id}`)} className="flex items-center gap-1 text-[13px] font-semibold text-[#4F46E5] hover:underline">Open Record <ArrowUpRight size={15} /></button>
                              <button onClick={() => setAuthorizeRec(r)} className="flex items-center gap-1 text-[13px] font-semibold text-[#4F46E5] hover:underline">Authorize Now <ArrowUpRight size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AuthorizationModal open={!!authorizeRec} onClose={() => setAuthorizeRec(null)} record={authorizeRec} />
    </div>
  );
}
