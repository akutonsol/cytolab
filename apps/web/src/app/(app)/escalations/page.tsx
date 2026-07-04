'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { AlertTriangle, Bell, CheckCircle2, ClipboardCheck, Eye, ShieldAlert, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import {
  OPEN_STATUSES, SEVERITY_META, STATUS_META, findingLabel, patientName,
  type EscalationRow, type EscalationSeverity, type EscalationStatus, type EscalationSummary,
} from '@/lib/escalations';

const SEVERITIES: EscalationSeverity[] = ['Abnormal', 'HighGrade', 'Malignant'];
const STATUSES: EscalationStatus[] = ['Pending', 'Acknowledged', 'UnderReview', 'Resolved'];

function SeverityBadge({ severity }: { severity: EscalationSeverity }) {
  const m = SEVERITY_META[severity];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: m.bg, color: m.fg }}>
      {severity === 'Malignant' && <AlertTriangle size={13} />}
      {m.label}
    </span>
  );
}
function StatusBadge({ status }: { status: EscalationStatus }) {
  const m = STATUS_META[status];
  return <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}

// ─── Detail slide-over ───────────────────────────────────────────────────────
function EscalationDetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [notes, setNotes] = useState('');

  const { data } = useQuery<EscalationRow>({
    queryKey: ['escalation', id],
    queryFn: () => api.get(`/escalations/${id}`).then((r) => r.data),
  });

  const act = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: any }) => api.patch(`/escalations/${id}/${action}`, body).then((r) => r.data),
    onSuccess: (_d, v) => {
      message.success(`Escalation ${v.action === 'acknowledge' ? 'acknowledged' : v.action === 'review' ? 'moved to review' : v.action === 'resolve' ? 'resolved' : 'dismissed'}.`);
      qc.invalidateQueries({ queryKey: ['escalation', id] });
      qc.invalidateQueries({ queryKey: ['escalations'] });
      qc.invalidateQueries({ queryKey: ['escalation-summary'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Action failed'),
  });

  const m = data ? SEVERITY_META[data.severity] : null;
  const b = data?.record.bethesdaResult;
  const narrative = b?.generatedNarrative ?? '';
  const isOpen = data ? OPEN_STATUSES.includes(data.status) : false;

  const steps: { key: EscalationStatus; label: string; at: string | null }[] = data
    ? [
        { key: 'Pending', label: 'Created', at: data.createdAt },
        { key: 'Acknowledged', label: 'Acknowledged', at: data.status === 'Acknowledged' || data.status === 'UnderReview' || data.status === 'Resolved' ? data.updatedAt : null },
        { key: 'UnderReview', label: 'Under Review', at: data.reviewedAt },
        { key: 'Resolved', label: data.status === 'Dismissed' ? 'Dismissed' : 'Resolved', at: data.resolvedAt },
      ]
    : [];

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2100, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[600px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: m?.bg ?? '#F1F5F9', color: m?.fg ?? '#475569' }}><ShieldAlert size={20} /></span>
            <div>
              <h3 className="text-[18px] font-bold text-[#0F172A]">Escalation detail</h3>
              <p className="mt-0.5 text-[13px] text-[#64748B]">{data ? `Lab# ${data.record.labNumber ?? data.record.identifier} · ${patientName(data)}` : 'Loading…'}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button>
        </div>

        {data && (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={data.severity} />
              <StatusBadge status={data.status} />
              <span className="text-[12px] text-[#94A3B8]">Triggered by {data.trigger === 'BethesdaClassification' ? 'Bethesda classification' : data.trigger === 'NarrativeKeyword' ? 'narrative keyword' : 'manual flag'}</span>
            </div>

            {/* Severity explanation */}
            <div className="mt-4 rounded-xl border px-4 py-3" style={{ background: m!.bg, borderColor: m!.border }}>
              <div className="text-[13px] font-semibold" style={{ color: m!.fg }}>This finding requires {data.reviewTimeframe ?? m!.timeframe} review.</div>
            </div>

            {/* Patient + record */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
              <Info label="Patient" value={patientName(data)} />
              <Info label="Reg No." value={data.record.patient?.registrationNo ?? '—'} />
              <Info label="Lab #" value={data.record.labNumber ?? data.record.identifier} />
              <Info label="Form" value={data.record.formType ?? '—'} />
              <Info label="Finding" value={findingLabel(data)} />
              <Info label="Assigned to" value={data.assignedTo ? `${data.assignedTo.firstName} ${data.assignedTo.lastName}` : 'Unassigned'} />
            </div>

            {/* Bethesda summary */}
            {b && (
              <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[12px] font-bold uppercase tracking-wide text-[#94A3B8]">Bethesda</div>
                <div className="mt-1 text-[13px] text-[#334155]">{[b.generalCategory, b.squamousCategory, b.ascSubtype, b.glandularCategory, b.otherMalignancy].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            )}

            {/* Narrative excerpt */}
            {narrative && (
              <div className="mt-4">
                <div className="text-[12px] font-bold uppercase tracking-wide text-[#94A3B8]">Narrative excerpt</div>
                <p className="mt-1 text-[13px] leading-relaxed text-[#475569]">{narrative.slice(0, 200)}{narrative.length > 200 ? '…' : ''}</p>
              </div>
            )}

            {/* Physician notification */}
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#E2E8F0] px-4 py-3">
              <Bell size={15} className="text-[#64748B]" />
              <span className="text-[13px] text-[#475569]">
                {data.physicianNotifiedAt
                  ? `Referring physician notified via ${data.physicianNotifiedVia} on ${new Date(data.physicianNotifiedAt).toLocaleString()}`
                  : 'No physician notification sent (no linked portal client).'}
              </span>
            </div>

            {/* Timeline */}
            <div className="mt-5">
              <div className="text-[12px] font-bold uppercase tracking-wide text-[#94A3B8]">Timeline</div>
              <div className="mt-2 flex flex-col gap-2.5">
                {steps.map((s) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: s.at ? '#DCFCE7' : '#F1F5F9', color: s.at ? '#16A34A' : '#CBD5E1' }}>
                      <CheckCircle2 size={14} />
                    </span>
                    <span className="text-[13px] text-[#334155]">{s.label}</span>
                    <span className="ml-auto text-[12px] text-[#94A3B8]">{s.at ? new Date(s.at).toLocaleString() : '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            {data.reviewNotes && (
              <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[12px] font-bold uppercase tracking-wide text-[#94A3B8]">Review notes</div>
                <div className="mt-1 text-[13px] text-[#334155]">{data.reviewNotes}</div>
              </div>
            )}

            {/* Actions */}
            {isOpen && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                {(data.status === 'UnderReview') && (
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Review notes (optional)…"
                    className="mb-3 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[14px] outline-none focus:border-[#4F46E5]"
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  {data.status === 'Pending' && <Btn onClick={() => act.mutate({ action: 'acknowledge' })}>Acknowledge</Btn>}
                  {(data.status === 'Pending' || data.status === 'Acknowledged') && <Btn onClick={() => act.mutate({ action: 'review' })}>Start review</Btn>}
                  <Btn primary onClick={() => act.mutate({ action: 'resolve', body: { notes } })}>Resolve</Btn>
                  <Btn ghost onClick={() => act.mutate({ action: 'dismiss', body: { notes } })}>Dismiss</Btn>
                </div>
              </div>
            )}

            <button onClick={() => router.push(`/records/${data.record.id}`)} className="mt-4 text-[13px] font-semibold text-[#4F46E5] hover:underline">
              View full record →
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

const Info = ({ label, value }: { label: string; value: string }) => (
  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</div><div className="mt-0.5 text-[#0F172A]">{value}</div></div>
);
const Btn = ({ children, onClick, primary, ghost }: { children: React.ReactNode; onClick: () => void; primary?: boolean; ghost?: boolean }) => (
  <button onClick={onClick}
    className="rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors"
    style={primary ? { background: '#4F46E5', color: '#fff' } : ghost ? { background: '#fff', color: '#64748B', border: '1px solid #E2E8F0' } : { background: '#EEF2FF', color: '#4F46E5' }}>
    {children}
  </button>
);

// ─── KPI card ────────────────────────────────────────────────────────────────
function Kpi({ icon, label, value, fg, bg }: { icon: React.ReactNode; label: string; value: number; fg: string; bg: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#EEF2F7] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
      <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: bg, color: fg }}>{icon}</span>
      <div>
        <div className="text-[24px] font-bold leading-none text-[#0F172A]">{value}</div>
        <div className="mt-1 text-[13px] text-[#64748B]">{label}</div>
      </div>
    </div>
  );
}

export default function EscalationsPage() {
  const { isEnabled } = useFeatures();
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [severity, setSeverity] = useState<EscalationSeverity | 'all'>('all');
  const [status, setStatus] = useState<EscalationStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: summary } = useQuery<EscalationSummary>({
    queryKey: ['escalation-summary'],
    queryFn: () => api.get('/escalations/summary').then((r) => r.data),
    enabled: isEnabled('ABNORMAL_ESCALATION'),
  });

  const { data: rows = [], isLoading } = useQuery<EscalationRow[]>({
    queryKey: ['escalations', severity, status],
    queryFn: () => api.get('/escalations', { params: { ...(severity !== 'all' && { severity }), ...(status !== 'all' && { status }) } }).then((r) => r.data),
    enabled: isEnabled('ABNORMAL_ESCALATION'),
  });

  const quickAct = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api.patch(`/escalations/${id}/${action}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escalations'] });
      qc.invalidateQueries({ queryKey: ['escalation-summary'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Action failed'),
  });

  const sorted = useMemo(() => rows, [rows]);

  if (!isEnabled('ABNORMAL_ESCALATION')) {
    return (
      <div className="min-h-full px-6 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm">
          <ShieldAlert size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Feature not enabled</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">Abnormal Result Escalation is disabled for this lab.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-6 pb-10 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
      <div className="mb-5">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Abnormal Result Escalation</h1>
        <p className="mt-1.5 text-[15px] text-[#6B7280]">Track and review abnormal, high-grade, and malignant cytology findings.</p>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={<ClipboardCheck size={20} />} label="Pending Review" value={summary?.pending ?? 0} fg="#4F46E5" bg="#EEF2FF" />
        <Kpi icon={<ShieldAlert size={20} />} label="High Grade" value={summary?.highGradeCount ?? 0} fg="#EF4444" bg="#FEF2F2" />
        <Kpi icon={<AlertTriangle size={20} />} label="Malignant" value={summary?.malignantCount ?? 0} fg="#B91C1C" bg="#FEE2E2" />
        <Kpi icon={<CheckCircle2 size={20} />} label="Resolved Today" value={summary?.resolvedToday ?? 0} fg="#16A34A" bg="#DCFCE7" />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-2">
          {(['all', ...SEVERITIES] as (EscalationSeverity | 'all')[]).map((s) => (
            <Chip key={s} active={severity === s} onClick={() => setSeverity(s)}>{s === 'all' ? 'All' : SEVERITY_META[s].label}</Chip>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {(['all', ...STATUSES] as (EscalationStatus | 'all')[]).map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)} subtle>{s === 'all' ? 'All statuses' : STATUS_META[s].label}</Chip>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <table className="w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-[#EEF2F7] text-[12px] uppercase tracking-wide text-[#94A3B8]">
              <th className="px-4 py-3 font-semibold">Severity</th>
              <th className="px-4 py-3 font-semibold">Record #</th>
              <th className="px-4 py-3 font-semibold">Patient</th>
              <th className="px-4 py-3 font-semibold">Finding</th>
              <th className="px-4 py-3 font-semibold">Assigned To</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-[#94A3B8]">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-[#94A3B8]">No escalations match these filters.</td></tr>
            ) : (
              sorted.map((row) => {
                const sev = SEVERITY_META[row.severity];
                const open = OPEN_STATUSES.includes(row.status);
                return (
                  <tr key={row.id} onClick={() => setSelectedId(row.id)}
                    className="cursor-pointer border-b border-[#F1F5F9] transition-colors hover:bg-[#F8FAFC]"
                    style={{ background: row.severity === 'Malignant' ? sev.rowBg : undefined }}>
                    <td className="px-4 py-3"><SeverityBadge severity={row.severity} /></td>
                    <td className="px-4 py-3 font-semibold text-[#0F172A]">{row.record.labNumber ?? row.record.identifier}</td>
                    <td className="px-4 py-3 text-[#334155]">{patientName(row)}</td>
                    <td className="px-4 py-3 text-[#334155]">{findingLabel(row)}</td>
                    <td className="px-4 py-3 text-[#64748B]">{row.assignedTo ? `${row.assignedTo.firstName} ${row.assignedTo.lastName}` : '—'}</td>
                    <td className="px-4 py-3 text-[#64748B]">{new Date(row.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1.5">
                        {row.status === 'Pending' && <MiniBtn onClick={() => quickAct.mutate({ id: row.id, action: 'acknowledge' })}>Acknowledge</MiniBtn>}
                        {open && row.status !== 'UnderReview' && <MiniBtn onClick={() => quickAct.mutate({ id: row.id, action: 'review' })}>Review</MiniBtn>}
                        {open && <MiniBtn onClick={() => quickAct.mutate({ id: row.id, action: 'resolve' })}>Resolve</MiniBtn>}
                        <MiniBtn ghost onClick={() => setSelectedId(row.id)}><Eye size={13} /></MiniBtn>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedId && <EscalationDetailPanel id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

const Chip = ({ children, active, onClick, subtle }: { children: React.ReactNode; active: boolean; onClick: () => void; subtle?: boolean }) => (
  <button onClick={onClick} className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
    style={active ? { background: subtle ? '#334155' : '#4F46E5', color: '#fff' } : { background: '#fff', color: '#475569', border: '1px solid #E2E8F0' }}>
    {children}
  </button>
);
const MiniBtn = ({ children, onClick, ghost }: { children: React.ReactNode; onClick: () => void; ghost?: boolean }) => (
  <button onClick={onClick} className="grid place-items-center rounded-md px-2 py-1 text-[12px] font-semibold transition-colors"
    style={ghost ? { background: '#F1F5F9', color: '#64748B' } : { background: '#EEF2FF', color: '#4F46E5' }}>
    {children}
  </button>
);
