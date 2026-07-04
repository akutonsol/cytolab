'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, FlaskConical, Plus, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import {
  STATUS_META, daysUntil, expiryColor, isExpiringSoon, relTime, shortDate,
  type ReagentDetail, type ReagentLot, type ReagentStats, type ReagentStatus,
} from '@/lib/reagent';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]';
const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]';
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (<div className="mb-3"><label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</label>{children}</div>);

function StatusBadge({ s }: { s: ReagentStatus }) {
  const m = STATUS_META[s];
  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: m.bg, color: m.fg }}>{(s === 'Quarantined' || s === 'Recalled') && <AlertTriangle size={11} />}{m.label}</span>;
}

// ─── Add Reagent modal ───────────────────────────────────────────────────────
function AddReagentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [f, setF] = useState({ name: '', lotNumber: '', manufacturer: '', catalogNumber: '', expiryDate: '', quantity: '', unit: '', storageTemp: '', notes: '' });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const save = useMutation({
    mutationFn: () => api.post('/reagents', { name: f.name, lotNumber: f.lotNumber, manufacturer: f.manufacturer || undefined, catalogNumber: f.catalogNumber || undefined, expiryDate: f.expiryDate || undefined, quantity: f.quantity ? Number(f.quantity) : undefined, unit: f.unit || undefined, storageTemp: f.storageTemp || undefined, notes: f.notes || undefined }),
    onSuccess: () => { message.success('Reagent lot added'); ['reagents', 'reagent-stats', 'reagents-expiring'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not add lot'),
  });
  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2100, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5"><h3 className="text-[18px] font-bold text-[#0F172A]">Add Reagent Lot</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button></div>
        <div className="flex-1 overflow-y-auto p-5">
          <F label="Reagent Name"><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Papanicolaou Stain" className={inp} /></F>
          <F label="Lot Number"><input value={f.lotNumber} onChange={(e) => set('lotNumber', e.target.value)} className={`${inp} font-mono`} /></F>
          <div className="grid grid-cols-2 gap-3"><F label="Manufacturer"><input value={f.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} className={inp} /></F><F label="Catalog #"><input value={f.catalogNumber} onChange={(e) => set('catalogNumber', e.target.value)} className={inp} /></F></div>
          <div className="grid grid-cols-2 gap-3"><F label="Expiry Date"><input type="date" value={f.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} className={inp} /></F><F label="Storage Temp"><input value={f.storageTemp} onChange={(e) => set('storageTemp', e.target.value)} placeholder="2-8°C" className={inp} /></F></div>
          <div className="grid grid-cols-2 gap-3"><F label="Quantity"><input type="number" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} className={inp} /></F><F label="Unit"><input value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="mL" className={inp} /></F></div>
          <F label="Notes"><textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={inp} /></F>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#64748B]">Cancel</button><button disabled={!f.name.trim() || !f.lotNumber.trim() || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Add Lot</button></div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Detail slide-over (info + log usage + history + quarantine) ─────────────
function ReagentDetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [labNumber, setLabNumber] = useState('');
  const [batchId, setBatchId] = useState('');
  const [quantityUsed, setQty] = useState('');
  const [useNotes, setUseNotes] = useState('');

  const { data: lot } = useQuery<ReagentDetail>({ queryKey: ['reagent', id], queryFn: () => api.get(`/reagents/${id}`).then((r) => r.data) });
  const { data: recPage } = useQuery<Paginated<any>>({ queryKey: ['reagent-records'], queryFn: () => api.get('/specimens', { params: { pageSize: 300 } }).then((r) => r.data) });
  const recordId = (recPage?.data ?? []).find((r: any) => (r.labNumber ?? r.identifier) === labNumber)?.id ?? null;

  const invalidate = () => ['reagent', 'reagents', 'reagent-stats', 'reagents-expiring'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const logUse = useMutation({
    mutationFn: () => api.post(`/reagents/${id}/use`, { recordId: recordId || undefined, batchId: batchId || undefined, quantityUsed: quantityUsed ? Number(quantityUsed) : undefined, notes: useNotes || undefined }),
    onSuccess: () => { message.success('Usage logged'); setLabNumber(''); setBatchId(''); setQty(''); setUseNotes(''); invalidate(); },
    onError: () => message.error('Could not log usage'),
  });
  const quarantine = useMutation({
    mutationFn: (reason: string) => api.post(`/reagents/${id}/quarantine`, { reason }),
    onSuccess: (r: any) => { message.success(`Lot quarantined${r.data.affectedRecent ? ` — ${r.data.affectedRecent} recent record(s) affected` : ''}`); invalidate(); },
    onError: () => message.error('Could not quarantine'),
  });
  const askQuarantine = () => {
    let reason = '';
    modal.confirm({
      title: 'Quarantine this lot?',
      content: <div><p className="mb-2 text-[13px] text-[#64748B]">This flags the lot as do-not-use and notifies the lab manager. Records processed in the last 7 days will be flagged.</p><input onChange={(e) => (reason = e.target.value)} placeholder="Reason for quarantine" className={inp} /></div>,
      okText: 'Quarantine', okButtonProps: { danger: true },
      onOk: () => { if (reason.trim()) quarantine.mutate(reason.trim()); else return Promise.reject(); },
    });
  };

  const m = lot ? STATUS_META[lot.status] : null;
  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2100, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[800px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <h3 className="text-[18px] font-bold text-[#0F172A]">{lot?.name ?? 'Loading…'}</h3>
            {lot && <p className="mt-0.5 flex items-center gap-2 text-[13px]"><span className="font-mono text-[#4F46E5]">{lot.lotNumber}</span> <StatusBadge s={lot.status} /></p>}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button>
        </div>
        {lot && (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] md:grid-cols-3">
              <Info label="Manufacturer" value={lot.manufacturer ?? '—'} />
              <Info label="Catalog #" value={lot.catalogNumber ?? '—'} />
              <Info label="Storage" value={lot.storageTemp ?? '—'} />
              <Info label="Expiry" value={<span style={{ color: expiryColor(lot.expiryDate), fontWeight: 600 }}>{shortDate(lot.expiryDate)}{lot.expiryDate ? ` (${daysUntil(lot.expiryDate)}d)` : ''}</span>} />
              <Info label="Received" value={shortDate(lot.receivedDate)} />
              <Info label="Opened" value={shortDate(lot.openedDate)} />
              <Info label="Quantity" value={lot.quantity != null ? `${lot.quantity} ${lot.unit ?? ''}` : '—'} />
            </div>

            {/* Log usage */}
            {lot.status === 'Active' && (
              <div className="mt-5 rounded-xl border border-[#E2E8F0] p-4">
                <div className="mb-2 text-[13px] font-bold text-[#0F172A]">Log Usage</div>
                <div className="grid grid-cols-2 gap-3">
                  <input list="reagent-rec-list" value={labNumber} onChange={(e) => setLabNumber(e.target.value)} placeholder="Link record (lab #, optional)" className={inp} />
                  <datalist id="reagent-rec-list">{(recPage?.data ?? []).map((r: any) => <option key={r.id} value={r.labNumber ?? r.identifier} />)}</datalist>
                  <input value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="Batch ID" className={inp} />
                  <input type="number" value={quantityUsed} onChange={(e) => setQty(e.target.value)} placeholder="Quantity used" className={inp} />
                  <input value={useNotes} onChange={(e) => setUseNotes(e.target.value)} placeholder="Notes" className={inp} />
                </div>
                <button onClick={() => logUse.mutate()} className="mt-3 rounded-lg bg-[#4F46E5] px-4 py-2 text-[13px] font-semibold text-white">Log Usage</button>
              </div>
            )}

            {/* Usage history */}
            <div className="mt-5">
              <div className="mb-2 text-[13px] font-bold text-[#0F172A]">Usage History ({lot.usages.length})</div>
              <div className="overflow-x-auto rounded-xl border border-[#EEF2F7]">
                <table className="w-full text-left text-[13px]">
                  <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#94A3B8]"><th className="px-3 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Used By</th><th className="px-3 py-2 font-semibold">Record</th><th className="px-3 py-2 font-semibold">Batch</th><th className="px-3 py-2 font-semibold">Qty</th></tr></thead>
                  <tbody>
                    {lot.usages.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-[#94A3B8]">No usage logged.</td></tr> : lot.usages.map((u) => (
                      <tr key={u.id} className="border-b border-[#F1F5F9]">
                        <td className="px-3 py-2 text-[#64748B]">{shortDate(u.usedAt)}</td>
                        <td className="px-3 py-2 text-[#334155]">{u.usedBy ? `${u.usedBy.firstName} ${u.usedBy.lastName}` : '—'}</td>
                        <td className="px-3 py-2 font-mono text-[#4F46E5]">{u.record ? (u.record.labNumber ?? u.record.identifier) : '—'}</td>
                        <td className="px-3 py-2 text-[#64748B]">{u.batchId ?? '—'}</td>
                        <td className="px-3 py-2 text-[#64748B]">{u.quantityUsed ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {lot.status === 'Active' && (
              <button onClick={askQuarantine} className="mt-5 flex items-center gap-2 rounded-lg px-4 py-2 text-[14px] font-semibold" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}><AlertTriangle size={16} /> Quarantine This Lot</button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (<div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</div><div className="mt-0.5 text-[#0F172A]">{value}</div></div>);

function Kpi({ label, value, fg = '#0F172A' }: { label: string; value: number; fg?: string }) {
  return <div className={`${CARD} p-4`}><div className="text-[24px] font-bold leading-none" style={{ color: fg }}>{value}</div><div className="mt-1.5 text-[13px] text-[#64748B]">{label}</div></div>;
}

export default function ReagentsPage() {
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('REAGENT_TRACKING');
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState('');

  const { data: lots = [] } = useQuery<ReagentLot[]>({ queryKey: ['reagents', fStatus], queryFn: () => api.get('/reagents', { params: { ...(fStatus && { status: fStatus }) } }).then((r) => r.data), enabled });
  const { data: stats } = useQuery<ReagentStats>({ queryKey: ['reagent-stats'], queryFn: () => api.get('/reagents/stats').then((r) => r.data), enabled });
  const { data: expiring = [] } = useQuery<ReagentLot[]>({ queryKey: ['reagents-expiring'], queryFn: () => api.get('/reagents/expiring').then((r) => r.data), enabled });

  if (!enabled) {
    return (
      <div className="min-h-full px-6 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm">
          <FlaskConical size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Feature not enabled</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">Reagent Tracking is disabled for this lab.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-6 pb-10 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Reagent &amp; Stain Lot Tracking</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Trace reagent lots to specimens for QC investigations and audits.</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white"><Plus size={16} /> Add Reagent Lot</button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Active Lots" value={stats?.totalActive ?? 0} fg="#16A34A" />
        <Kpi label="Expiring Soon" value={stats?.expiringSoon ?? 0} fg={(stats?.expiringSoon ?? 0) > 0 ? '#B45309' : '#0F172A'} />
        <Kpi label="Quarantined" value={stats?.quarantined ?? 0} fg={(stats?.quarantined ?? 0) > 0 ? '#B91C1C' : '#0F172A'} />
        <Kpi label="Usages This Month" value={stats?.usagesThisMonth ?? 0} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[65fr_35fr]">
        {/* Lots table */}
        <div className={CARD}>
          <div className="flex items-center justify-between border-b border-[#EEF2F7] p-3">
            <span className="text-[15px] font-bold text-[#0F172A]">Reagent Lots</span>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-[13px] outline-none">
              <option value="">All statuses</option>{['Active', 'Quarantined', 'Expired', 'Recalled', 'Depleted'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#94A3B8]"><th className="px-3 py-2.5 font-semibold">Reagent</th><th className="px-3 py-2.5 font-semibold">Lot Number</th><th className="px-3 py-2.5 font-semibold">Expiry</th><th className="px-3 py-2.5 font-semibold">Status</th><th className="px-3 py-2.5 font-semibold">Usages</th></tr></thead>
              <tbody>
                {lots.length === 0 ? <tr><td colSpan={5} className="px-3 py-10 text-center text-[#94A3B8]">No reagent lots.</td></tr> : lots.map((l) => (
                  <tr key={l.id} onClick={() => setDetailId(l.id)} className="cursor-pointer border-b border-[#F1F5F9] transition-colors hover:bg-[#F8FAFC]" style={{ background: STATUS_META[l.status].rowBg }}>
                    <td className="px-3 py-2.5"><div className="font-semibold text-[#0F172A]">{l.name}</div><div className="text-[11px] text-[#94A3B8]">{l.manufacturer ?? '—'}</div></td>
                    <td className="px-3 py-2.5 font-mono text-[#4F46E5]">{l.lotNumber}</td>
                    <td className="px-3 py-2.5" style={{ color: expiryColor(l.expiryDate), fontWeight: isExpiringSoon(l.expiryDate) ? 600 : 400 }}>{shortDate(l.expiryDate)}</td>
                    <td className="px-3 py-2.5"><StatusBadge s={l.status} /></td>
                    <td className="px-3 py-2.5 text-[#64748B]">{l.usageCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-5">
          <div className={`${CARD} p-4`}>
            <div className="mb-2 text-[15px] font-bold text-[#0F172A]">Expiring Soon</div>
            {expiring.length === 0 ? <div className="text-[13px] text-[#94A3B8]">No lots expiring within 30 days.</div> : (
              <div className="flex flex-col gap-2">
                {expiring.map((l) => { const d = daysUntil(l.expiryDate); return (
                  <button key={l.id} onClick={() => setDetailId(l.id)} className="flex items-center justify-between rounded-lg border border-[#EEF2F7] px-3 py-2 text-left">
                    <span><span className="block text-[13px] font-semibold text-[#0F172A]">{l.name}</span><span className="block font-mono text-[11px] text-[#4F46E5]">{l.lotNumber}</span></span>
                    <span className="text-[12px] font-bold" style={{ color: (d ?? 99) < 7 ? '#B91C1C' : '#B45309' }}>{d}d</span>
                  </button>
                ); })}
              </div>
            )}
          </div>
          <div className={`${CARD} p-4`}>
            <div className="mb-2 text-[15px] font-bold text-[#0F172A]">Recent Usages</div>
            {(stats?.recentUsages ?? []).length === 0 ? <div className="text-[13px] text-[#94A3B8]">No usage logged yet.</div> : (
              <div className="flex flex-col gap-2">
                {(stats?.recentUsages ?? []).slice(0, 5).map((u) => (
                  <div key={u.id} className="text-[13px]">
                    <div className="font-semibold text-[#0F172A]">{u.reagentName}</div>
                    <div className="text-[12px] text-[#94A3B8]">{u.usedBy}{u.recordNo ? ` · ${u.recordNo}` : ''} · {relTime(u.usedAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {addOpen && <AddReagentModal onClose={() => setAddOpen(false)} />}
      {detailId && <ReagentDetailPanel id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
