'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { AlertTriangle, CalendarClock, ClipboardCopy, Download, Plus, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import {
  FILTER_TABS, STATUS_META, dueColor, dueLabel, shortDate,
  type Recall, type RecallListRow, type RecallStatus, type RecallSummary,
} from '@/lib/recall';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]';
const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]';

function StatusBadge({ s }: { s: RecallStatus }) {
  const m = STATUS_META[s];
  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: m.bg, color: m.fg }}>{s === 'Overdue' && <AlertTriangle size={11} />}{m.label}</span>;
}
function Kpi({ label, value, fg = '#0F172A' }: { label: string; value: number; fg?: string }) {
  return <div className={`${CARD} p-4`}><div className="text-[24px] font-bold leading-none" style={{ color: fg }}>{value}</div><div className="mt-1.5 text-[13px] text-[#64748B]">{label}</div></div>;
}

// ─── Detail slide-over ───────────────────────────────────────────────────────
function RecallDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [notes, setNotes] = useState('');
  const { data: r } = useQuery<Recall>({ queryKey: ['recall', id], queryFn: () => api.get(`/recalls/${id}`).then((res) => res.data) });
  const invalidate = () => ['recall', 'recalls', 'recall-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const act = useMutation({
    mutationFn: ({ ep, body }: { ep: string; body?: any }) => api.post(`/recalls/${id}/${ep}`, body ?? {}).then((res) => res.data),
    onSuccess: (_d, v) => { message.success(v.ep === 'complete' ? 'Marked completed' : v.ep === 'notify-client' ? 'Client notified' : v.ep === 'cancel' ? 'Cancelled' : 'Declined'); invalidate(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Action failed'),
  });
  const m = r ? STATUS_META[r.status] : null;
  const isOpen = r ? ['Pending', 'Due', 'Overdue'].includes(r.status) : false;

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2100, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[600px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div><h3 className="text-[18px] font-bold text-[#0F172A]">{r?.patientName ?? 'Loading…'}</h3>{r && <p className="mt-0.5 text-[13px] text-[#64748B]">{r.patient?.registrationNo ?? ''} · {r.triggerDiagnosis} recall</p>}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button>
        </div>
        {r && (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex items-center gap-2"><StatusBadge s={r.status} /><span className="text-[13px] font-semibold" style={{ color: dueColor(r.daysUntilDue) }}>{dueLabel(r.daysUntilDue)}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              <Info label="DOB" value={shortDate(r.patient?.dateOfBirth ?? null)} />
              <Info label="Reg No." value={r.patient?.registrationNo ?? '—'} />
              <Info label="Triggering Result" value={<span className="font-mono">{r.labNo}</span>} />
              <Info label="Result Date" value={shortDate(r.triggerDate)} />
              <Info label="Diagnosis" value={r.triggerDiagnosis} />
              <Info label="Interval" value={`${r.recallIntervalMonths} months`} />
              <Info label="Due Date" value={<span style={{ color: dueColor(r.daysUntilDue), fontWeight: 600 }}>{shortDate(r.dueDate)}</span>} />
              <Info label="Client" value={r.clientName} />
            </div>

            {/* Timeline */}
            <div className="mt-5">
              <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#94A3B8]">Timeline</div>
              <div className="flex flex-col gap-2 text-[13px]">
                <TL label="Created" at={r.createdAt} on />
                <TL label="Due" at={r.dueDate} on={r.daysUntilDue <= 0} />
                <TL label={r.status === 'Completed' ? 'Completed' : 'Follow-up'} at={r.completedAt} on={!!r.completedAt} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#E2E8F0] px-3 py-2 text-[13px] text-[#475569]">
              {r.clientNotifiedAt ? `Referring client notified ${shortDate(r.clientNotifiedAt)}` : 'Referring client not yet notified'}
            </div>

            {isOpen && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)…" className={`${inp} mb-3`} />
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => act.mutate({ ep: 'complete' })} className="rounded-lg bg-[#16A34A] px-3.5 py-2 text-[13px] font-semibold text-white">Complete</button>
                  <button onClick={() => act.mutate({ ep: 'notify-client' })} className="rounded-lg bg-[#4F46E5] px-3.5 py-2 text-[13px] font-semibold text-white">Notify Client</button>
                  <button onClick={() => act.mutate({ ep: 'cancel', body: { notes } })} className="rounded-lg border border-[#E2E8F0] px-3.5 py-2 text-[13px] font-semibold text-[#64748B]">Cancel</button>
                  <button onClick={() => act.mutate({ ep: 'decline', body: { notes } })} className="rounded-lg border border-[#E2E8F0] px-3.5 py-2 text-[13px] font-semibold text-[#64748B]">Decline</button>
                </div>
              </div>
            )}
            {r.notes && <div className="mt-4 rounded-xl bg-[#F8FAFC] p-3 text-[13px] text-[#334155]"><span className="font-semibold">Notes:</span> {r.notes}</div>}
            {r.patient && <button onClick={() => router.push(`/patients/${r.patient!.id}`)} className="mt-4 text-[13px] font-semibold text-[#4F46E5] hover:underline">View patient →</button>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (<div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</div><div className="mt-0.5 text-[#0F172A]">{value}</div></div>);
const TL = ({ label, at, on }: { label: string; at: string | null; on: boolean }) => (
  <div className="flex items-center gap-3"><span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? '#16A34A' : '#CBD5E1' }} /><span className="text-[#334155]">{label}</span><span className="ml-auto text-[12px] text-[#94A3B8]">{at ? shortDate(at) : '—'}</span></div>
);

// ─── Generate List modal ─────────────────────────────────────────────────────
function GenerateListModal({ onClose }: { onClose: () => void }) {
  const { message } = AntdApp.useApp();
  const [status, setStatus] = useState('');
  const [dueBefore, setDueBefore] = useState('');
  const { data: rows = [] } = useQuery<RecallListRow[]>({ queryKey: ['recall-genlist', status, dueBefore], queryFn: () => api.get('/recalls/generate-list', { params: { ...(status && { status }), ...(dueBefore && { dueBefore }) } }).then((r) => r.data) });
  const copy = () => { navigator.clipboard.writeText(rows.map((r) => `${r.patientName}\t${shortDate(r.dueDate)}\t${r.lastResult}`).join('\n')); message.success('List copied to clipboard'); };
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <style dangerouslySetInnerHTML={{ __html: '@media print { body * { visibility: hidden !important; } .recall-print-area, .recall-print-area * { visibility: visible !important; } .recall-print-area { position: absolute !important; left: 0; top: 0; width: 100%; } @page { margin: 16mm; } }' }} />
      <div className="flex max-h-[88vh] w-full max-w-[720px] flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5"><h3 className="text-[18px] font-bold text-[#0F172A]">Generate Recall List</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button></div>
        <div className="flex flex-wrap items-center gap-3 border-b border-[#EEF2F7] p-4">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-[13px]"><option value="">Due + Overdue</option>{['Pending', 'Due', 'Overdue', 'Completed'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <label className="flex items-center gap-2 text-[13px] text-[#64748B]">Due before<input type="date" value={dueBefore} onChange={(e) => setDueBefore(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-[13px]" /></label>
          <span className="ml-auto text-[13px] font-semibold text-[#334155]">{rows.length} patients</span>
        </div>
        <div className="recall-print-area flex-1 overflow-y-auto p-5">
          <div className="mb-3 hidden text-[18px] font-bold text-[#0F172A] print:block">Patient Recall List</div>
          <table className="w-full text-left text-[13px]">
            <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#94A3B8]"><th className="px-3 py-2 font-semibold">Patient</th><th className="px-3 py-2 font-semibold">DOB</th><th className="px-3 py-2 font-semibold">Last Result</th><th className="px-3 py-2 font-semibold">Due Date</th><th className="px-3 py-2 font-semibold">Client</th><th className="px-3 py-2 font-semibold">Overdue</th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-[#94A3B8]">No patients match.</td></tr> : rows.map((r, i) => (
                <tr key={i} className="border-b border-[#F1F5F9]"><td className="px-3 py-2 font-semibold text-[#0F172A]">{r.patientName}</td><td className="px-3 py-2 text-[#64748B]">{shortDate(r.dob)}</td><td className="px-3 py-2 text-[#334155]">{r.lastResult}</td><td className="px-3 py-2 text-[#334155]">{shortDate(r.dueDate)}</td><td className="px-3 py-2 text-[#64748B]">{r.clientName}</td><td className="px-3 py-2" style={{ color: r.daysPastDue ? '#B91C1C' : '#94A3B8' }}>{r.daysPastDue ? `${r.daysPastDue}d` : '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={copy} className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#64748B]"><ClipboardCopy size={15} /> Copy List</button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white"><Download size={15} /> Export as PDF</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Manual recall modal ─────────────────────────────────────────────────────
function ManualRecallModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [patientId, setPatientId] = useState('');
  const [triggerRecordId, setRecordId] = useState('');
  const [intervalMonths, setInterval] = useState(12);
  const [notes, setNotes] = useState('');
  const { data: patientsPage } = useQuery<Paginated<any>>({ queryKey: ['recall-patients'], queryFn: () => api.get('/patients', { params: { pageSize: 300 } }).then((r) => r.data) });
  const { data: recsPage } = useQuery<Paginated<any>>({ queryKey: ['recall-records', patientId], enabled: !!patientId, queryFn: () => api.get('/specimens/patient', { params: { patientId, pageSize: 100 } }).then((r) => r.data) });
  const save = useMutation({
    mutationFn: () => api.post('/recalls/manual', { patientId, triggerRecordId, intervalMonths, notes: notes || undefined }),
    onSuccess: () => { message.success('Recall created'); ['recalls', 'recall-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not create recall'),
  });
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-[460px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-[18px] font-bold text-[#0F172A]">Manual Recall</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button></div>
        <div className="flex flex-col gap-3">
          <select value={patientId} onChange={(e) => { setPatientId(e.target.value); setRecordId(''); }} className={inp}><option value="">Select patient…</option>{(patientsPage?.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.registrationNo ? ` (${p.registrationNo})` : ''}</option>)}</select>
          <select value={triggerRecordId} onChange={(e) => setRecordId(e.target.value)} disabled={!patientId} className={inp}><option value="">{patientId ? 'Select triggering record…' : 'Select a patient first'}</option>{(recsPage?.data ?? []).map((r: any) => <option key={r.id} value={r.id}>{r.labNumber ?? r.identifier} · {new Date(r.specimenDate ?? r.createdAt).toLocaleDateString()}</option>)}</select>
          <label className="flex items-center gap-2 text-[13px] text-[#64748B]">Recall interval<input type="number" min={1} max={120} value={intervalMonths} onChange={(e) => setInterval(Number(e.target.value))} className={inp} />months</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className={inp} />
        </div>
        <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#64748B]">Cancel</button><button disabled={!patientId || !triggerRecordId || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Create Recall</button></div>
      </div>
    </div>,
    document.body,
  );
}

export default function RecallsPage() {
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('PATIENT_RECALL');
  const [tab, setTab] = useState<RecallStatus | 'all'>('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const { data: summary } = useQuery<RecallSummary>({ queryKey: ['recall-summary'], queryFn: () => api.get('/recalls/summary').then((r) => r.data), enabled });
  const { data: recalls = [] } = useQuery<Recall[]>({ queryKey: ['recalls', tab], queryFn: () => api.get('/recalls', { params: { ...(tab !== 'all' && { status: tab }) } }).then((r) => r.data), enabled });

  if (!enabled) {
    return (
      <div className="min-h-full px-6 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm">
          <CalendarClock size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Feature not enabled</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">Patient Recall is disabled for this lab.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-6 pb-10 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Patient Recall Management</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Automated follow-up scheduling for repeat cytology.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setManualOpen(true)} className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#334155]">Manual Recall</button>
          <button onClick={() => setGenOpen(true)} className="rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white">Generate List</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Pending" value={summary?.pending ?? 0} />
        <Kpi label="Due Now" value={summary?.due ?? 0} fg={(summary?.due ?? 0) > 0 ? '#B45309' : '#0F172A'} />
        <Kpi label="Overdue" value={summary?.overdue ?? 0} fg={(summary?.overdue ?? 0) > 0 ? '#B91C1C' : '#0F172A'} />
        <Kpi label="Completed This Month" value={summary?.completedThisMonth ?? 0} fg="#16A34A" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-full bg-[#F1F5F9] p-1" style={{ width: 'fit-content' }}>
        {FILTER_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors" style={tab === t ? { background: '#fff', color: '#0F172A', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: '#64748B' }}>{t === 'all' ? 'All' : t}</button>
        ))}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#94A3B8]">
              <th className="px-3 py-2.5 font-semibold">Patient</th><th className="px-3 py-2.5 font-semibold">Last Result</th><th className="px-3 py-2.5 font-semibold">Diagnosis</th>
              <th className="px-3 py-2.5 font-semibold">Due Date</th><th className="px-3 py-2.5 font-semibold">Countdown</th><th className="px-3 py-2.5 font-semibold">Client</th><th className="px-3 py-2.5 font-semibold">Status</th>
            </tr></thead>
            <tbody>
              {recalls.length === 0 ? <tr><td colSpan={7} className="px-3 py-12 text-center text-[#94A3B8]">No recalls.</td></tr> : recalls.map((r) => {
                const strike = r.status === 'Cancelled' || r.status === 'Declined';
                return (
                  <tr key={r.id} onClick={() => setDetailId(r.id)} className="cursor-pointer border-b border-[#F1F5F9] transition-colors hover:bg-[#F8FAFC]" style={{ background: STATUS_META[r.status].rowBg }}>
                    <td className="px-3 py-2.5 font-semibold text-[#0F172A]">{r.patientName}</td>
                    <td className="px-3 py-2.5 font-mono text-[#4F46E5]">{r.labNo}</td>
                    <td className="px-3 py-2.5 text-[#334155]">{r.triggerDiagnosis}</td>
                    <td className="px-3 py-2.5" style={{ color: dueColor(r.daysUntilDue), textDecoration: strike ? 'line-through' : undefined }}>{shortDate(r.dueDate)}</td>
                    <td className="px-3 py-2.5 font-semibold" style={{ color: dueColor(r.daysUntilDue) }}>{['Completed', 'Cancelled', 'Declined'].includes(r.status) ? '—' : dueLabel(r.daysUntilDue)}</td>
                    <td className="px-3 py-2.5 text-[#64748B]">{r.clientName}</td>
                    <td className="px-3 py-2.5"><StatusBadge s={r.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detailId && <RecallDetail id={detailId} onClose={() => setDetailId(null)} />}
      {genOpen && <GenerateListModal onClose={() => setGenOpen(false)} />}
      {manualOpen && <ManualRecallModal onClose={() => setManualOpen(false)} />}
    </div>
  );
}
