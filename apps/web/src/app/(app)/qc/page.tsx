'use client';

import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, FlaskConical, Plus, ShieldCheck, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type Paginated } from '@/lib/api';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import {
  CHECK_TYPES, RESULT_META, checkTypeLabel,
  type Equipment, type QCAlert, type QCCheck, type QCResult, type QCStats,
} from '@/lib/qc';

function ResultBadge({ r }: { r: QCResult }) {
  const m = RESULT_META[r];
  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: m.bg, color: m.fg }}>{r === 'Fail' && <AlertTriangle size={11} />}{m.label}</span>;
}

function Kpi({ label, value, fg, bg, icon }: { label: string; value: string | number; fg: string; bg: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#EEF2F7] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
      <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: bg, color: fg }}>{icon}</span>
      <div><div className="text-[24px] font-bold leading-none text-[#0F172A]">{value}</div><div className="mt-1 text-[13px] text-[#64748B]">{label}</div></div>
    </div>
  );
}

// ─── Log QC modal ────────────────────────────────────────────────────────────
function LogQCModal({ equipment, onClose }: { equipment: Equipment[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [checkType, setCheckType] = useState('SlidePreparation');
  const [result, setResult] = useState<QCResult>('Pass');
  const [equipmentId, setEquipmentId] = useState('');
  const [labNumber, setLabNumber] = useState('');
  const [batchId, setBatchId] = useState('');
  const [notes, setNotes] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [reagentLotId, setReagentLotId] = useState('');
  const [performedAt, setPerformedAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));

  // Resolve the optional linked record by lab number (active records only).
  const { data: recPage } = useQuery<Paginated<any>>({ queryKey: ['qc-records'], queryFn: () => api.get('/specimens', { params: { pageSize: 300 } }).then((r) => r.data) });
  const recOptions = recPage?.data ?? [];
  const recordId = useMemo(() => recOptions.find((r) => (r.labNumber ?? r.identifier) === labNumber)?.id ?? null, [recOptions, labNumber]);

  // Reagent-lot traceability: link the QC check to the reagent lot in use by
  // logging a ReagentUsage (feature-gated).
  const reagentEnabled = useFeatures().isEnabled('REAGENT_TRACKING');
  const { data: reagentLots = [] } = useQuery<{ id: string; name: string; lotNumber: string; status: string }[]>({ queryKey: ['reagents-active-qc'], queryFn: () => api.get('/reagents', { params: { status: 'Active' } }).then((r) => r.data), enabled: reagentEnabled });

  const save = useMutation({
    mutationFn: async () => {
      await api.post('/qc', {
        checkType, result, equipmentId: equipmentId || undefined, recordId: recordId || undefined,
        batchId: batchId || undefined, notes: notes || undefined,
        failureReason: result === 'Fail' ? failureReason || undefined : undefined,
        correctiveAction: correctiveAction || undefined,
        performedAt: new Date(performedAt).toISOString(),
      });
      // Trace the reagent lot in use for this check.
      if (reagentLotId) {
        await api.post(`/reagents/${reagentLotId}/use`, { recordId: recordId || undefined, batchId: batchId || undefined, notes: `QC ${checkType} — ${result}` }).catch(() => undefined);
      }
    },
    onSuccess: () => {
      message.success('QC check logged');
      ['qc-list', 'qc-stats', 'qc-alerts', 'record-detail', 'reagent-stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not log check'),
  });

  const canSave = !!checkType && !!result && (result !== 'Fail' || failureReason.trim().length > 0);

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2100, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <h3 className="text-[18px] font-bold text-[#0F172A]">Log QC Check</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <Field label="Check Type">
            <select value={checkType} onChange={(e) => setCheckType(e.target.value)} className={inp}>
              {CHECK_TYPES.map((t) => <option key={t} value={t}>{checkTypeLabel(t)}</option>)}
            </select>
          </Field>
          <Field label="Result">
            <div className="flex gap-2">
              {(['Pass', 'Marginal', 'Fail'] as QCResult[]).map((r) => (
                <button key={r} type="button" onClick={() => setResult(r)}
                  className="flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors"
                  style={result === r ? { background: RESULT_META[r].bg, color: RESULT_META[r].fg, boxShadow: `inset 0 0 0 1.5px ${RESULT_META[r].fg}` } : { background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
                  {RESULT_META[r].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Equipment">
            <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} className={inp}>
              <option value="">— None —</option>
              {equipment.filter((e) => e.isActive).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Linked Record (lab number, optional)">
            <input list="qc-rec-list" value={labNumber} onChange={(e) => setLabNumber(e.target.value)} placeholder="Type a lab number…" className={inp} />
            <datalist id="qc-rec-list">{recOptions.map((r) => <option key={r.id} value={r.labNumber ?? r.identifier} />)}</datalist>
            {labNumber && !recordId && <div className="mt-1 text-[11px] text-[#B91C1C]">No matching active record.</div>}
          </Field>
          <Field label="Batch ID (optional)"><input value={batchId} onChange={(e) => setBatchId(e.target.value)} className={inp} /></Field>
          {reagentEnabled && (
            <Field label="Reagent Lot Used (optional)">
              <select value={reagentLotId} onChange={(e) => setReagentLotId(e.target.value)} className={inp}>
                <option value="">— None —</option>
                {reagentLots.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.lotNumber}</option>)}
              </select>
            </Field>
          )}
          <Field label="Notes (optional)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inp} /></Field>
          {result === 'Fail' && (
            <Field label="Failure Reason (required)">
              <textarea value={failureReason} onChange={(e) => setFailureReason(e.target.value)} rows={2} placeholder="What failed and why…" className={`${inp} ${!failureReason.trim() ? 'border-[#FECACA]' : ''}`} />
            </Field>
          )}
          <Field label="Corrective Action (optional)"><textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} rows={2} className={inp} /></Field>
          <Field label="Performed At"><input type="datetime-local" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} className={inp} /></Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#64748B]">Cancel</button>
          <button disabled={!canSave || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Log Check</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Resolve alert slide-over ────────────────────────────────────────────────
function ResolveModal({ alert, onClose }: { alert: QCAlert; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [action, setAction] = useState('');
  const resolve = useMutation({
    mutationFn: () => api.patch(`/qc/alerts/${alert.id}/resolve`, { correctiveAction: action || undefined }),
    onSuccess: () => { message.success('Alert resolved'); ['qc-alerts', 'qc-stats', 'qc-list'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); },
    onError: () => message.error('Could not resolve'),
  });
  const c = alert.qcCheck;
  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2100, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <h3 className="text-[18px] font-bold text-[#0F172A]">Resolve QC Failure</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-xl border px-4 py-3" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
            <div className="text-[13px] font-bold text-[#B91C1C]">{checkTypeLabel(c.checkType)} — Fail</div>
            <div className="mt-1 text-[13px] text-[#334155]">{c.failureReason ?? 'No reason recorded'}</div>
            <div className="mt-1 text-[12px] text-[#94A3B8]">{c.equipment?.name ?? 'No equipment'} · {c.performedBy ? `${c.performedBy.firstName} ${c.performedBy.lastName}` : '—'} · {new Date(c.performedAt).toLocaleString()}</div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">Corrective Action</label>
            <textarea value={action} onChange={(e) => setAction(e.target.value)} rows={4} placeholder="Describe what was done to correct the failure…" className={inp} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#64748B]">Cancel</button>
          <button disabled={resolve.isPending} onClick={() => resolve.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Mark Resolved</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#4F46E5]';
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-3.5"><label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</label>{children}</div>
);

export default function QCPage() {
  const { can } = useAuth();
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('QC_MODULE');
  const canLog = can('record:change');
  const [logOpen, setLogOpen] = useState(false);
  const [resolveAlert, setResolveAlert] = useState<QCAlert | null>(null);
  const [fType, setFType] = useState('');
  const [fResult, setFResult] = useState('');
  const [fEquip, setFEquip] = useState('');

  const { data: stats } = useQuery<QCStats>({ queryKey: ['qc-stats'], queryFn: () => api.get('/qc/stats').then((r) => r.data), enabled });
  const { data: equipment = [] } = useQuery<Equipment[]>({ queryKey: ['qc-equipment'], queryFn: () => api.get('/equipment').then((r) => r.data), enabled });
  const { data: alerts = [] } = useQuery<QCAlert[]>({ queryKey: ['qc-alerts'], queryFn: () => api.get('/qc/alerts').then((r) => r.data), enabled, refetchInterval: 60_000 });

  // Server-side infinite scroll for the QC log. Filters are server params, so a
  // filter change gives a new fetchFn → the hook reloads from page 1.
  const fetchFn = useCallback(
    (page: number, pageSize: number) =>
      api.get<Paginated<QCCheck>>('/qc', { params: { page, pageSize, ...(fType && { checkType: fType }), ...(fResult && { result: fResult }), ...(fEquip && { equipmentId: fEquip }) } }).then((r) => r.data),
    [fType, fResult, fEquip],
  );
  const { items: checks, loading, initialLoading, hasMore, sentinelRef, reset } =
    useInfiniteScroll<QCCheck>({ fetchFn, pageSize: 15, enabled });

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm">
          <ShieldCheck size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Feature not enabled</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">Quality Control is disabled for this lab.</div>
        </div>
      </div>
    );
  }

  const trend = stats?.trendByDay ?? [];
  const byCat = (stats?.failsByType ?? []).map((f) => ({ name: checkTypeLabel(f.type).replace(' ', '\n'), count: f.count }));

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Quality Control</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Track slide prep, staining, and fixation quality; log and resolve QC failures.</p>
        </div>
        {canLog && <button onClick={() => setLogOpen(true)} className="flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white"><Plus size={16} /> Log QC Check</button>}
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Pass Rate" value={`${stats?.passRate ?? 0}%`} fg="#16A34A" bg="#DCFCE7" icon={<CheckCircle2 size={20} />} />
        <Kpi label="Fail Count" value={stats?.failCount ?? 0} fg="#B91C1C" bg="#FEE2E2" icon={<AlertTriangle size={20} />} />
        <Kpi label="Marginal Count" value={stats?.marginalCount ?? 0} fg="#A16207" bg="#FEFCE8" icon={<FlaskConical size={20} />} />
        <Kpi label="Open Alerts" value={alerts.length} fg={alerts.length > 0 ? '#B91C1C' : '#16A34A'} bg={alerts.length > 0 ? '#FEE2E2' : '#DCFCE7'} icon={<ShieldCheck size={20} />} />
      </div>

      {/* Main: log table + alerts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[65fr_35fr]">
        {/* Log table */}
        <div className="rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#EEF2F7] p-3">
            <select value={fType} onChange={(e) => { setFType(e.target.value); }} className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-[13px] outline-none">
              <option value="">All types</option>{CHECK_TYPES.map((t) => <option key={t} value={t}>{checkTypeLabel(t)}</option>)}
            </select>
            <select value={fResult} onChange={(e) => { setFResult(e.target.value); }} className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-[13px] outline-none">
              <option value="">All results</option><option>Pass</option><option>Marginal</option><option>Fail</option>
            </select>
            <select value={fEquip} onChange={(e) => { setFEquip(e.target.value); }} className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-[13px] outline-none">
              <option value="">All equipment</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#94A3B8]">
                  <th className="px-3 py-2.5 font-semibold">Date</th><th className="px-3 py-2.5 font-semibold">Type</th>
                  <th className="px-3 py-2.5 font-semibold">Equipment</th><th className="px-3 py-2.5 font-semibold">By</th>
                  <th className="px-3 py-2.5 font-semibold">Result</th><th className="px-3 py-2.5 font-semibold">Record</th>
                </tr>
              </thead>
              <tbody>
                {!initialLoading && checks.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-[#94A3B8]">No QC checks logged yet.</td></tr>
                ) : checks.map((c) => (
                  <tr key={c.id} className="border-b border-[#F1F5F9]">
                    <td className="px-3 py-2.5 text-[#64748B]">{new Date(c.performedAt).toLocaleDateString()} {new Date(c.performedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-3 py-2.5 text-[#334155]">{checkTypeLabel(c.checkType)}</td>
                    <td className="px-3 py-2.5 text-[#64748B]">{c.equipment?.name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[#64748B]">{c.performedBy ? `${c.performedBy.firstName} ${c.performedBy.lastName}` : '—'}</td>
                    <td className="px-3 py-2.5"><ResultBadge r={c.result} /></td>
                    <td className="px-3 py-2.5 font-semibold text-[#0F172A]">{c.record ? (c.record.labNumber ?? c.record.identifier) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Infinite scroll: auto-loads the next page of QC checks on scroll. */}
          {checks.length > 0 && (
            <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
          )}
        </div>

        {/* Alerts panel */}
        <div className="rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="border-b border-[#EEF2F7] p-4 text-[15px] font-bold text-[#0F172A]">Open Failure Alerts ({alerts.length})</div>
          <div className="flex flex-col gap-3 p-4">
            {alerts.length === 0 ? (
              <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-6 text-center text-[14px] font-semibold text-[#16A34A]">No open failures ✓</div>
            ) : alerts.map((a) => (
              <div key={a.id} className="rounded-xl border px-4 py-3" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-[#B91C1C]">{checkTypeLabel(a.qcCheck.checkType)}</span>
                  <ResultBadge r="Fail" />
                </div>
                <div className="mt-1 text-[12px] text-[#334155]">{a.qcCheck.equipment?.name ?? 'No equipment'}{a.qcCheck.record ? ` · Lab# ${a.qcCheck.record.labNumber ?? a.qcCheck.record.identifier}` : ''}</div>
                <div className="mt-0.5 text-[11px] text-[#94A3B8]">{a.qcCheck.performedBy ? `${a.qcCheck.performedBy.firstName} ${a.qcCheck.performedBy.lastName}` : '—'} · {new Date(a.qcCheck.performedAt).toLocaleDateString()}</div>
                {canLog && <button onClick={() => setResolveAlert(a)} className="mt-2 rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-[#B91C1C]" style={{ border: '1px solid #FECACA' }}>Resolve</button>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Analytics */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#EEF2F7] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="mb-3 text-[15px] font-bold text-[#0F172A]">Pass Rate Trend <span className="text-[12px] font-normal text-[#94A3B8]">· last 30 days</span></div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={(d) => d.slice(5)} interval={5} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="pass" stroke="#16A34A" strokeWidth={2} dot={false} name="Pass" />
              <Line type="monotone" dataKey="fail" stroke="#EF4444" strokeWidth={2} dot={false} name="Fail" />
              <Line type="monotone" dataKey="marginal" stroke="#A16207" strokeWidth={2} dot={false} name="Marginal" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-2xl border border-[#EEF2F7] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="mb-3 text-[15px] font-bold text-[#0F172A]">Failures by Category</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byCat} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={0} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} name="Failures" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {logOpen && <LogQCModal equipment={equipment} onClose={() => { setLogOpen(false); reset(); }} />}
      {resolveAlert && <ResolveModal alert={resolveAlert} onClose={() => { setResolveAlert(null); reset(); }} />}
    </div>
  );
}
