'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  CODING_TYPES, SYSTEM_META, type CodeSystem, type CodingType, type MedicalCode, type RecordCoding, type Suggestion,
} from '@/lib/coding';
import { IconAction } from '@/components/ui';
import { notify } from '@/lib/notify';

function SystemBadge({ system }: { system: CodeSystem }) {
  const m = SYSTEM_META[system];
  return <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}

interface Meta { labNo?: string; patientInitials?: string; specimenType?: string; bethesda?: string | null }

export function CodingPanel({ recordId, meta, onClose }: { recordId: string; meta?: Meta; onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [addType, setAddType] = useState<CodingType>('Diagnosis');

  const invalidate = () => ['coding-record', 'coding-suggest', 'coding-records', 'coding-stats', 'coding-codes'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const { data: assigned = [] } = useQuery<RecordCoding[]>({ queryKey: ['coding-record', recordId], queryFn: () => api.get(`/coding/record/${recordId}`).then((r) => r.data) });
  const { data: suggestions = [] } = useQuery<Suggestion[]>({ queryKey: ['coding-suggest', recordId], queryFn: () => api.get(`/coding/suggest/${recordId}`).then((r) => r.data) });
  const { data: results = [] } = useQuery<MedicalCode[]>({ queryKey: ['coding-codes', search], enabled: search.trim().length > 0, queryFn: () => api.get('/coding/codes', { params: { search } }).then((r) => r.data) });

  const assign = useMutation({
    mutationFn: (v: { codeId: string; codeType: CodingType }) => api.post(`/coding/record/${recordId}`, v).then((r) => r.data),
    onSuccess: () => { notify.success('Code assigned'); invalidate(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Could not assign code'),
  });
  const remove = useMutation({
    mutationFn: (codeId: string) => api.delete(`/coding/record/${recordId}/code/${codeId}`).then((r) => r.data),
    onSuccess: () => { notify.success('Code removed'); invalidate(); },
    onError: () => notify.error('Could not remove code'),
  });

  const assignedIds = new Set(assigned.map((a) => a.code.id));

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[600px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <h3 className="text-[18px] font-bold text-[#0F172A]">Assign Codes</h3>
            <p className="mt-0.5 text-[13px] text-[#475569]">
              <span className="font-mono">{meta?.labNo ?? recordId.slice(0, 8)}</span>
              {meta?.patientInitials ? ` · ${meta.patientInitials}` : ''}{meta?.specimenType ? ` · ${meta.specimenType}` : ''}{meta?.bethesda ? ` · ${meta.bethesda}` : ''}
            </p>
          </div>
          <IconAction icon={<X size={16} />} tone="strong" onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Suggested */}
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-[#475569]"><Sparkles size={13} className="text-[#7C3AED]" /> Suggested Codes</div>
          {suggestions.length === 0 ? (
            <div className="mb-5 text-[13px] text-[#475569]">No suggestions for this record.</div>
          ) : (
            <div className="mb-5 flex flex-col gap-2">
              {suggestions.map((s) => {
                const done = s.alreadyAssigned || assignedIds.has(s.code.id);
                return (
                  <div key={`${s.code.id}-${s.codeType}`} className="flex items-center gap-2.5 rounded-xl border border-[#EEF2F7] px-3 py-2.5">
                    <SystemBadge system={s.code.system} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-[#0F172A]"><span className="font-mono">{s.code.code}</span> · {s.codeType}</div>
                      <div className="truncate text-[12px] text-[#475569]">{s.code.display} · <span className="text-[#475569]">{s.reason}</span></div>
                    </div>
                    {done ? (
                      <span className="flex items-center gap-1 text-[12px] font-semibold text-[#16A34A]"><Check size={13} /> Added</span>
                    ) : (
                      <button onClick={() => assign.mutate({ codeId: s.code.id, codeType: s.codeType })} className="flex items-center gap-1 rounded-lg bg-[#4F46E5] px-2.5 py-1 text-[12px] font-semibold text-white"><Plus size={13} /> Add</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Assigned */}
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#475569]">Assigned Codes ({assigned.length})</div>
          {assigned.length === 0 ? (
            <div className="mb-5 text-[13px] text-[#475569]">No codes assigned yet.</div>
          ) : (
            <div className="mb-5 flex flex-col gap-2">
              {assigned.map((a) => (
                <div key={a.id} className="flex items-center gap-2.5 rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] px-3 py-2.5">
                  <SystemBadge system={a.code.system} />
                  <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[#475569] ring-1 ring-[#E2E8F0]">{a.codeType}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[#0F172A]"><span className="font-mono">{a.code.code}</span></div>
                    <div className="truncate text-[12px] text-[#475569]">{a.code.display}</div>
                  </div>
                  <button onClick={() => remove.mutate(a.code.id)} className="grid h-7 w-7 place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Search & add */}
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#475569]">Search &amp; Add</div>
          <div className="mb-2 flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code or description…" className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-[14px] outline-none focus:border-[#4F46E5]" />
            </div>
            <select value={addType} onChange={(e) => setAddType(e.target.value as CodingType)} className="h-10 rounded-lg border border-[#E2E8F0] bg-white px-2 text-[13px] outline-none focus:border-[#4F46E5]">
              {CODING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {search.trim() && (
            <div className="flex flex-col gap-1.5">
              {results.length === 0 ? <div className="py-3 text-[13px] text-[#475569]">No matching codes.</div> : results.slice(0, 20).map((c) => {
                const done = assignedIds.has(c.id);
                return (
                  <div key={c.id} className="flex items-center gap-2.5 rounded-lg border border-[#F1F5F9] px-3 py-2">
                    <SystemBadge system={c.system} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-[#0F172A]"><span className="font-mono">{c.code}</span></div>
                      <div className="truncate text-[12px] text-[#475569]">{c.display}</div>
                    </div>
                    {done ? <span className="text-[12px] font-semibold text-[#16A34A]">Added</span> : (
                      <button onClick={() => assign.mutate({ codeId: c.id, codeType: addType })} className="rounded-lg border border-[#E2E8F0] px-2.5 py-1 text-[12px] font-semibold text-[#4F46E5] hover:bg-[#EEF2FF]">Add</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
