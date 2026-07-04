'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlarmClock, Check, CheckCircle2, Clock, Pencil, Plus, RefreshCw, Settings2, Trash2, TriangleAlert, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SPECIMEN_LABELS } from '@/lib/specimen-types';

type Level = 'Approaching' | 'Breached';
type Status = 'Open' | 'Acknowledged' | 'Resolved';
interface Alert {
  id: string; level: Level; status: Status; thresholdHours: number; elapsedHours: number; dueAt: string;
  acknowledgedBy: { firstName: string; lastName: string } | null;
  config: { id: string; name: string } | null;
  record: { id: string; labNumber: string | null; identifier: string; formType: string | null; status: string; urgent: boolean; specimenDate: string | null; patient: { firstName: string; lastName: string } | null; specimens: { type: string }[] };
}
interface Stats { openBreached: number; openApproaching: number; acknowledged: number; resolved: number; activeConfigs: number }
interface Config { id: string; name: string; specimenType: string | null; thresholdHours: number; warningHours: number; urgentThresholdHours: number | null; isActive: boolean }

const fmtDur = (h: number) => (h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`);
const LEVEL: Record<Level, { bg: string; color: string; label: string }> = {
  Breached: { bg: '#FEF2F2', color: '#DC2626', label: 'Breached' },
  Approaching: { bg: '#FFFBEB', color: '#B45309', label: 'Approaching' }, // detector-safe amber
};
const STATUS: Record<Status, { bg: string; color: string }> = {
  Open: { bg: '#EEF2FF', color: '#4F46E5' }, Acknowledged: { bg: '#F0F9FF', color: '#0284C7' }, Resolved: { bg: '#F0FDF4', color: '#16A34A' },
};

export default function TatPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'Breached' | 'Approaching' | 'Resolved'>('Breached');
  const [cfgModal, setCfgModal] = useState<{ mode: 'new' | 'edit'; config?: Config } | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const { data: stats } = useQuery({ queryKey: ['tat-stats'], queryFn: () => api.get<Stats>('/tat/stats').then((r) => r.data) });
  const { data: alerts = [] } = useQuery({
    queryKey: ['tat-alerts', filter],
    queryFn: () => api.get<Alert[]>('/tat/alerts', { params: filter === 'Resolved' ? { status: 'Resolved' } : { level: filter, status: undefined } }).then((r) => r.data),
  });
  const { data: configs = [] } = useQuery({ queryKey: ['tat-configs'], queryFn: () => api.get<Config[]>('/tat/configs').then((r) => r.data) });

  const refetch = () => { qc.invalidateQueries({ queryKey: ['tat-alerts'] }); qc.invalidateQueries({ queryKey: ['tat-stats'] }); };

  const scan = useMutation({
    mutationFn: () => api.post<{ scanned: number; breached: number; approaching: number; resolved: number }>('/tat/scan').then((r) => r.data),
    onSuccess: (d) => { refetch(); notify('ok', `Scanned ${d.scanned} records — ${d.breached} breached, ${d.approaching} approaching`); },
    onError: () => notify('err', 'Scan failed'),
  });
  const ack = useMutation({ mutationFn: (id: string) => api.patch(`/tat/alerts/${id}/acknowledge`), onSuccess: () => { refetch(); notify('ok', 'Acknowledged'); } });
  const resolve = useMutation({ mutationFn: (id: string) => api.patch(`/tat/alerts/${id}/resolve`), onSuccess: () => { refetch(); notify('ok', 'Resolved'); } });
  const delCfg = useMutation({ mutationFn: (id: string) => api.delete(`/tat/configs/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tat-configs'] }); qc.invalidateQueries({ queryKey: ['tat-stats'] }); notify('ok', 'Threshold deleted'); } });

  const shown = filter === 'Resolved' ? alerts : alerts.filter((a) => a.status !== 'Resolved');

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="px-6 py-8 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-charcoal-heading">TAT Alerts</h1>
            <p className="mt-1 font-body-sm text-body-sm text-secondary">Turnaround-time monitoring — breaches and approaching deadlines.</p>
          </div>
          <button className="btn-primary" disabled={scan.isPending} onClick={() => scan.mutate()}>
            <RefreshCw size={16} className={scan.isPending ? 'animate-spin' : ''} /> {scan.isPending ? 'Scanning…' : 'Run Scan'}
          </button>
        </div>

        {/* KPI strip */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi icon={TriangleAlert} color="#DC2626" label="Open Breaches" value={stats?.openBreached ?? 0} />
          <Kpi icon={AlarmClock} color="#B45309" label="Approaching" value={stats?.openApproaching ?? 0} />
          <Kpi icon={Check} color="#0284C7" label="Acknowledged" value={stats?.acknowledged ?? 0} />
          <Kpi icon={CheckCircle2} color="#16A34A" label="Resolved" value={stats?.resolved ?? 0} />
        </div>

        {/* Filter pills */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {(['Breached', 'Approaching', 'Resolved'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-3.5 py-1.5 font-label-sm text-label-sm font-semibold transition-colors ${filter === f ? 'bg-primary text-on-primary' : 'bg-white text-secondary hover:bg-surface-container-low'}`}>{f}</button>
          ))}
        </div>

        {/* Alerts table */}
        <div className="glass-card mb-6 overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/40 bg-surface-container-low/40">
                  {['Record', 'Patient', 'Specimen', 'Elapsed / Target', 'Overdue', 'Level', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 size={40} className="text-[#BBF7D0]" />
                      <p className="font-headline-sm text-headline-sm text-charcoal-heading">No {filter.toLowerCase()} alerts</p>
                      <p className="font-body-sm text-body-sm text-secondary">Run a scan to refresh turnaround-time status.</p>
                    </div>
                  </td></tr>
                ) : shown.map((a) => {
                  const lv = LEVEL[a.level]; const st = STATUS[a.status];
                  const overdue = a.elapsedHours - a.thresholdHours;
                  return (
                    <tr key={a.id} className="border-b border-surface-container-low transition-colors hover:bg-surface-container-low/50">
                      <td className="px-4 py-3">
                        <Link href={`/records/${a.record.id}`} className="inline-block rounded-md bg-primary-fixed px-2 py-0.5 font-mono text-[13px] text-primary hover:underline">{a.record.labNumber ?? a.record.identifier}</Link>
                        {a.record.urgent && <span className="ml-1.5 rounded bg-[#FEF2F2] px-1.5 py-0.5 text-[10px] font-bold text-[#DC2626]">URGENT</span>}
                      </td>
                      <td className="px-4 py-3 font-body-sm text-body-sm text-secondary">{a.record.patient ? `${a.record.patient.firstName} ${a.record.patient.lastName}` : '—'}</td>
                      <td className="px-4 py-3 font-body-sm text-body-sm text-secondary">{a.record.specimens.map((s) => SPECIMEN_LABELS[s.type] ?? s.type).join(', ') || '—'}</td>
                      <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">{fmtDur(a.elapsedHours)} <span className="text-secondary">/ {fmtDur(a.thresholdHours)}</span></td>
                      <td className="px-4 py-3 font-body-sm text-body-sm font-semibold" style={{ color: overdue > 0 ? '#DC2626' : '#B45309' }}>{overdue > 0 ? `+${fmtDur(overdue)}` : `in ${fmtDur(-overdue)}`}</td>
                      <td className="px-4 py-3"><span style={{ background: lv.bg, color: lv.color }} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium">{a.level === 'Breached' ? <TriangleAlert size={12} /> : <Clock size={12} />}{lv.label}</span></td>
                      <td className="px-4 py-3"><span style={{ background: st.bg, color: st.color }} className="inline-block rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium">{a.status}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {a.status === 'Open' && <button onClick={() => ack.mutate(a.id)} title="Acknowledge" className="rounded-lg border border-outline-variant/40 px-2.5 py-1 font-label-sm text-label-sm font-semibold text-primary hover:bg-primary-fixed">Ack</button>}
                          {a.status !== 'Resolved' && <button onClick={() => resolve.mutate(a.id)} title="Resolve" className="rounded-lg border border-outline-variant/40 px-2.5 py-1 font-label-sm text-label-sm font-semibold text-status-sage hover:bg-status-sage/10">Resolve</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Config editor */}
        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-outline-variant/40 px-5 py-4">
            <div className="flex items-center gap-2"><Settings2 size={16} className="text-secondary" /><h2 className="font-headline-sm text-headline-sm text-charcoal-heading">TAT Thresholds</h2></div>
            <button className="btn-primary !h-9 !px-3 !text-[13px]" onClick={() => setCfgModal({ mode: 'new' })}><Plus size={14} /> New Threshold</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/40 bg-surface-container-low/40">
                  {['Name', 'Specimen Type', 'Target', 'Urgent / High-grade', 'Warn before', 'Active', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c.id} className="border-b border-surface-container-low">
                    <td className="px-4 py-3 font-body-sm text-body-sm font-semibold text-charcoal-heading">{c.name}</td>
                    <td className="px-4 py-3 font-body-sm text-body-sm text-secondary">{c.specimenType ? (SPECIMEN_LABELS[c.specimenType] ?? c.specimenType) : 'All (default)'}</td>
                    <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">{fmtDur(c.thresholdHours)}</td>
                    <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">{c.urgentThresholdHours ? fmtDur(c.urgentThresholdHours) : '—'}</td>
                    <td className="px-4 py-3 font-body-sm text-body-sm text-secondary">{fmtDur(c.warningHours)}</td>
                    <td className="px-4 py-3">{c.isActive ? <span className="rounded-full px-2 py-0.5 font-label-sm text-label-sm font-medium" style={{ background: '#F0FDF4', color: '#16A34A' }}>Active</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 font-label-sm text-label-sm text-slate-500">Off</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCfgModal({ mode: 'edit', config: c })} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low hover:text-primary"><Pencil size={14} /></button>
                        <button onClick={() => delCfg.mutate(c.id)} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-error-container hover:text-error"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {configs.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center font-body-sm text-body-sm text-secondary">No thresholds configured.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {cfgModal && <ConfigModal mode={cfgModal.mode} config={cfgModal.config} onClose={() => setCfgModal(null)}
        onSaved={() => { setCfgModal(null); qc.invalidateQueries({ queryKey: ['tat-configs'] }); qc.invalidateQueries({ queryKey: ['tat-stats'] }); notify('ok', cfgModal.mode === 'new' ? 'Threshold created' : 'Threshold saved'); }}
        onError={(m) => notify('err', m)} />}

      {toast && <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>}
    </div>
  );
}

function Kpi({ icon: Icon, color, label, value }: { icon: any; color: string; label: string; value: number }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <span style={{ background: `${color}15`, color }} className="mb-3 grid h-10 w-10 place-items-center rounded-xl"><Icon size={18} /></span>
      <div className="font-display text-[30px] font-bold leading-none" style={{ color }}>{value}</div>
      <div className="mt-1.5 font-label-sm text-label-sm uppercase tracking-wider text-secondary">{label}</div>
    </div>
  );
}

const SPEC_OPTIONS = Object.keys(SPECIMEN_LABELS);
function ConfigModal({ mode, config, onClose, onSaved, onError }: { mode: 'new' | 'edit'; config?: Config; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [f, setF] = useState({
    name: config?.name ?? '', specimenType: config?.specimenType ?? '',
    thresholdHours: String(config?.thresholdHours ?? 120), warningHours: String(config?.warningHours ?? 24),
    urgentThresholdHours: config?.urgentThresholdHours != null ? String(config.urgentThresholdHours) : '', isActive: config?.isActive ?? true,
  });
  const set = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }));
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name.trim(), specimenType: f.specimenType || null,
        thresholdHours: parseInt(f.thresholdHours) || 0, warningHours: parseInt(f.warningHours) || 0,
        urgentThresholdHours: f.urgentThresholdHours ? parseInt(f.urgentThresholdHours) : null, isActive: f.isActive,
      };
      return mode === 'new' ? api.post('/tat/configs', body) : api.patch(`/tat/configs/${config!.id}`, body);
    },
    onSuccess: onSaved, onError: (e: any) => onError(e?.response?.data?.message ?? 'Save failed'),
  });
  const canSave = !!f.name.trim() && (parseInt(f.thresholdHours) || 0) > 0 && !save.isPending;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-[480px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">{mode === 'new' ? 'New TAT Threshold' : 'Edit Threshold'}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low"><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-4">
          <F label="Name" required><input autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Routine Pap" className={inp} /></F>
          <F label="Specimen type"><select value={f.specimenType} onChange={(e) => set('specimenType', e.target.value)} className={inp}><option value="">All specimen types (default)</option>{SPEC_OPTIONS.map((s) => <option key={s} value={s}>{SPECIMEN_LABELS[s]}</option>)}</select></F>
          <div className="grid grid-cols-2 gap-4">
            <F label="Target (hours)" required><input type="number" min="1" value={f.thresholdHours} onChange={(e) => set('thresholdHours', e.target.value)} className={inp} /></F>
            <F label="Urgent target (hours)"><input type="number" min="1" value={f.urgentThresholdHours} onChange={(e) => set('urgentThresholdHours', e.target.value)} placeholder="e.g. 24" className={inp} /></F>
          </div>
          <F label="Warn before (hours)"><input type="number" min="0" value={f.warningHours} onChange={(e) => set('warningHours', e.target.value)} className={inp} /></F>
          <label className="flex items-center gap-2.5"><input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} style={{ accentColor: '#4F46E5', width: 16, height: 16 }} /><span className="font-body-sm text-body-sm text-on-surface">Active</span></label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!canSave} style={{ opacity: canSave ? 1 : 0.5 }} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
const inp = 'h-11 w-full rounded-xl border border-outline-variant/40 bg-white px-3.5 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary';
function F({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="mb-1.5 block font-label-md text-label-md text-on-surface">{label}{required && <span className="text-error"> *</span>}</label>{children}</div>;
}
