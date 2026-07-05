'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Hash, Plus, Search, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { CodingPanel } from '@/components/CodingPanel';
import {
  STATUS_META, SYSTEM_META, shortDate,
  type CodeSystem, type CodingRecordRow, type CodingStats, type ExportData, type MedicalCode,
} from '@/lib/coding';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]';
const TABS = ['Records', 'Code Dictionary', 'Export'] as const;
type Tab = typeof TABS[number];

function Kpi({ label, value, fg = '#0F172A' }: { label: string; value: string; fg?: string }) {
  return <div className={`${CARD} p-4`}><div className="truncate text-[22px] font-bold leading-none" style={{ color: fg }}>{value}</div><div className="mt-1.5 text-[13px] text-[#64748B]">{label}</div></div>;
}
function SystemBadge({ system }: { system: CodeSystem }) {
  const m = SYSTEM_META[system];
  return <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}

// ── Add Code modal ───────────────────────────────────────────────────────────
function AddCodeModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [system, setSystem] = useState<CodeSystem>('LOINC');
  const [code, setCode] = useState('');
  const [display, setDisplay] = useState('');
  const [category, setCategory] = useState('');
  const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]';
  const save = useMutation({
    mutationFn: () => api.post('/coding/codes', { system, code, display, category: category || undefined }).then((r) => r.data),
    onSuccess: () => { message.success('Code added'); ['coding-codes', 'coding-stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not add code'),
  });
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2300, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-[18px] font-bold text-[#0F172A]">Add Code</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button></div>
        <div className="flex flex-col gap-3">
          <select value={system} onChange={(e) => setSystem(e.target.value as CodeSystem)} className={inp}>{(['LOINC', 'SNOMED_CT', 'ICD10', 'CPT'] as CodeSystem[]).map((s) => <option key={s} value={s}>{SYSTEM_META[s].label}</option>)}</select>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (e.g. 10524-7)" className={inp} />
          <input value={display} onChange={(e) => setDisplay(e.target.value)} placeholder="Display description" className={inp} />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)" className={inp} />
        </div>
        <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#64748B]">Cancel</button><button disabled={!code || !display || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Add Code</button></div>
      </div>
    </div>,
    document.body,
  );
}

export default function CodingPage() {
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('LOINC_SNOMED');
  const { message } = AntdApp.useApp();
  const [tab, setTab] = useState<Tab>('Records');
  const [panel, setPanel] = useState<CodingRecordRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [dictSearch, setDictSearch] = useState('');
  const [dictSystem, setDictSystem] = useState<CodeSystem | ''>('');
  // Export controls
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [format, setFormat] = useState<'json' | 'csv'>('csv');

  const { data: stats } = useQuery<CodingStats>({ queryKey: ['coding-stats'], queryFn: () => api.get('/coding/stats').then((r) => r.data), enabled });
  const { data: records = [] } = useQuery<CodingRecordRow[]>({ queryKey: ['coding-records'], queryFn: () => api.get('/coding/records').then((r) => r.data), enabled: enabled && tab === 'Records' });
  const { data: codes = [] } = useQuery<MedicalCode[]>({ queryKey: ['coding-codes', dictSearch, dictSystem], queryFn: () => api.get('/coding/codes', { params: { ...(dictSearch && { search: dictSearch }), ...(dictSystem && { system: dictSystem }) } }).then((r) => r.data), enabled: enabled && tab === 'Code Dictionary' });
  const { data: preview } = useQuery<ExportData>({ queryKey: ['coding-export-preview', dateFrom, dateTo], queryFn: () => api.get('/coding/export', { params: { format: 'json', ...(dateFrom && { dateFrom }), ...(dateTo && { dateTo }) } }).then((r) => r.data), enabled: enabled && tab === 'Export' });

  const download = async () => {
    try {
      const res = await api.get('/coding/export', { params: { format, ...(dateFrom && { dateFrom }), ...(dateTo && { dateTo }) }, responseType: format === 'csv' ? 'text' : 'json' });
      const body = format === 'csv' ? res.data : JSON.stringify(res.data, null, 2);
      const blob = new Blob([body], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `coded-records.${format}`; a.click(); URL.revokeObjectURL(url);
      message.success('Export downloaded');
    } catch { message.error('Export failed'); }
  };

  const mostUsed = stats?.mostUsedCodes?.[0];

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm">
          <Hash size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Feature not enabled</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">LOINC/SNOMED Coding is disabled for this lab.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">LOINC/SNOMED Coding</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Standardized coding for billing and EMR interoperability.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAddOpen(true)} className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#334155]">Add Code</button>
          <button onClick={() => setTab('Export')} className="rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white">Export</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Coded Records" value={String(stats?.totalCoded ?? 0)} fg="#16A34A" />
        <Kpi label="Uncoded Records" value={String(stats?.uncoded ?? 0)} fg={(stats?.uncoded ?? 0) > 0 ? '#B45309' : '#0F172A'} />
        <Kpi label="Codes in Dictionary" value={String(stats?.dictionarySize ?? 0)} />
        <Kpi label="Most Used Code" value={mostUsed ? `${mostUsed.code}` : '—'} fg="#4F46E5" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-full bg-[#F1F5F9] p-1" style={{ width: 'fit-content' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors" style={tab === t ? { background: '#fff', color: '#0F172A', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: '#64748B' }}>{t}</button>
        ))}
      </div>

      {/* Records tab */}
      {tab === 'Records' && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#94A3B8]">
                <th className="px-3 py-2.5 font-semibold">Record</th><th className="px-3 py-2.5 font-semibold">Patient</th><th className="px-3 py-2.5 font-semibold">Specimen</th>
                <th className="px-3 py-2.5 font-semibold">Bethesda</th><th className="px-3 py-2.5 font-semibold">Codes</th><th className="px-3 py-2.5 font-semibold">Status</th><th className="px-3 py-2.5 font-semibold"></th>
              </tr></thead>
              <tbody>
                {records.length === 0 ? <tr><td colSpan={7} className="px-3 py-12 text-center text-[#94A3B8]">No records to code.</td></tr> : records.map((r) => {
                  const s = STATUS_META[r.status];
                  return (
                    <tr key={r.recordId} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                      <td className="px-3 py-2.5 font-mono font-semibold text-[#4F46E5]">{r.labNo}</td>
                      <td className="px-3 py-2.5 font-semibold text-[#0F172A]">{r.patientInitials}</td>
                      <td className="px-3 py-2.5 text-[#334155]">{r.specimenType}</td>
                      <td className="px-3 py-2.5 text-[#334155]">{r.bethesda ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[#334155]">{r.codesAssigned}</td>
                      <td className="px-3 py-2.5"><span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: s.bg, color: s.fg, boxShadow: s.outline ? `inset 0 0 0 1px ${s.fg}` : undefined }}>{s.label}</span></td>
                      <td className="px-3 py-2.5"><button onClick={() => setPanel(r)} className="rounded-lg bg-[#EEF2FF] px-2.5 py-1 text-[12px] font-semibold text-[#4F46E5]">Code</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Code Dictionary tab */}
      {tab === 'Code Dictionary' && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-[#EEF2F7] p-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input value={dictSearch} onChange={(e) => setDictSearch(e.target.value)} placeholder="Search codes…" className="h-9 w-64 rounded-lg border border-[#E2E8F0] pl-9 pr-3 text-[13px] outline-none focus:border-[#4F46E5]" />
            </div>
            <select value={dictSystem} onChange={(e) => setDictSystem(e.target.value as CodeSystem | '')} className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-[13px]"><option value="">All systems</option>{(['LOINC', 'SNOMED_CT', 'ICD10', 'CPT'] as CodeSystem[]).map((s) => <option key={s} value={s}>{SYSTEM_META[s].label}</option>)}</select>
            <button onClick={() => setAddOpen(true)} className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-[13px] font-semibold text-white"><Plus size={14} /> Add Code</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#94A3B8]">
                <th className="px-3 py-2.5 font-semibold">System</th><th className="px-3 py-2.5 font-semibold">Code</th><th className="px-3 py-2.5 font-semibold">Display</th>
                <th className="px-3 py-2.5 font-semibold">Category</th><th className="px-3 py-2.5 font-semibold">Usage</th><th className="px-3 py-2.5 font-semibold">Status</th>
              </tr></thead>
              <tbody>
                {codes.length === 0 ? <tr><td colSpan={6} className="px-3 py-12 text-center text-[#94A3B8]">No codes.</td></tr> : codes.map((c) => (
                  <tr key={c.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5"><SystemBadge system={c.system} /></td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-[#0F172A]">{c.code}</td>
                    <td className="px-3 py-2.5 text-[#334155]">{c.display}</td>
                    <td className="px-3 py-2.5 text-[#64748B]">{c.category ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[#334155]">{c.usageCount}</td>
                    <td className="px-3 py-2.5">{c.isActive ? <span className="text-[12px] font-semibold text-[#16A34A]">Active</span> : <span className="text-[12px] font-semibold text-[#94A3B8]">Inactive</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Export tab */}
      {tab === 'Export' && (
        <div className={`${CARD} p-5`}>
          <div className="flex flex-wrap items-end gap-4">
            <div><label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">From</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px]" /></div>
            <div><label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">To</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px]" /></div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">Format</label>
              <div className="flex gap-1.5">
                {(['csv', 'json'] as const).map((f) => <button key={f} onClick={() => setFormat(f)} className="rounded-lg border px-3 py-2 text-[13px] font-semibold uppercase transition-colors" style={format === f ? { borderColor: '#4F46E5', background: '#EEF2FF', color: '#4F46E5' } : { borderColor: '#E2E8F0', color: '#64748B' }}>{f}</button>)}
              </div>
            </div>
            <button onClick={download} className="flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white"><Download size={15} /> Generate Export</button>
            <span className="ml-auto text-[13px] text-[#64748B]">{preview?.count ?? 0} coded record{(preview?.count ?? 0) === 1 ? '' : 's'} in range</span>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#94A3B8]">Preview (first 5)</div>
            <div className="flex flex-col gap-2">
              {(preview?.records ?? []).length === 0 ? <div className="text-[13px] text-[#94A3B8]">No coded records in this range.</div> : (preview?.records ?? []).slice(0, 5).map((r, i) => (
                <div key={i} className="rounded-xl border border-[#EEF2F7] p-3">
                  <div className="text-[13px] font-semibold text-[#0F172A]"><span className="font-mono text-[#4F46E5]">{r.labNo}</span> · {r.patientInitials} · {r.specimenType} · {shortDate(r.date)}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.codes.map((c, j) => <span key={j} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: SYSTEM_META[c.system].bg, color: SYSTEM_META[c.system].fg }}>{SYSTEM_META[c.system].label} {c.code}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {panel && <CodingPanel recordId={panel.recordId} meta={{ labNo: panel.labNo, patientInitials: panel.patientInitials, specimenType: panel.specimenType, bethesda: panel.bethesda }} onClose={() => setPanel(null)} />}
      {addOpen && <AddCodeModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}
