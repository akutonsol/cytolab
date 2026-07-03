'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, GripVertical, Info, Pencil, Plus, TextCursorInput, Trash2,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Field { id: string; fieldKey: string; label: string; fieldType: 'TEXT' | 'CHECKBOX'; showWhenPrinting: boolean; printGroupId: string | null; sortOrder: number; enabled: boolean }
interface Group { id: string; name: string; sortOrder: number }
interface Config { formType: string; fields: Field[]; printGroups: Group[] }

const PRETTY: Record<string, string> = { Gynecology: 'Gynecology', NonGynecology: 'Non-Gynecology' };

export default function EditFormPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const message = {
    success: (msg: string) => { setToast({ type: 'ok', msg }); setTimeout(() => setToast(null), 3000); },
    error: (msg: string) => { setToast({ type: 'err', msg }); setTimeout(() => setToast(null), 3000); },
  };
  const formType = String(useParams().formType);

  const { data } = useQuery<Config>({ queryKey: ['form-config', formType], queryFn: () => api.get(`/form-config/${formType}`).then((r) => r.data), enabled: !!formType });

  const [tab, setTab] = useState<'fields' | 'print'>('fields');
  const [fields, setFields] = useState<Field[]>([]);
  const [expandedId, setExpandedId] = useState<string>();
  const [renamingId, setRenamingId] = useState<string>();
  const [renameVal, setRenameVal] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const dragIndex = useRef<number | null>(null);

  useEffect(() => { if (data) setFields([...data.fields].sort((a, b) => a.sortOrder - b.sortOrder)); }, [data]);
  const groups = useMemo(() => [...(data?.printGroups ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [data]);
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? null;

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.put(`/form-config/field/${id}`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['form-config', formType] }),
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not update field'),
  });
  const addGroup = useMutation({
    mutationFn: (name: string) => api.post(`/form-config/${formType}/print-group`, { name }).then((r) => r.data),
    onSuccess: () => { setNewGroup(''); setGroupOpen(false); qc.invalidateQueries({ queryKey: ['form-config', formType] }); message.success('Print group added'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not add print group'),
  });
  const delGroup = useMutation({
    mutationFn: (id: string) => api.delete(`/form-config/print-group/${id}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['form-config', formType] }); message.success('Print group deleted'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not delete print group'),
  });

  // Drag-reorder fields, persisting sortOrder for the ones that moved.
  const onDrop = (to: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === to) return;
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setFields(next);
    Promise.all(next.map((f, i) => (f.sortOrder !== i ? api.put(`/form-config/field/${f.id}`, { sortOrder: i }) : null)).filter(Boolean))
      .then(() => qc.invalidateQueries({ queryKey: ['form-config', formType] }));
  };

  const saveAll = useMutation({
    mutationFn: () => Promise.all(fields.map((f, i) => api.put(`/form-config/field/${f.id}`, { label: f.label, sortOrder: i, showWhenPrinting: f.showWhenPrinting, printGroupId: f.printGroupId, enabled: f.enabled }))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['form-config', formType] }); message.success('Form saved'); },
    onError: () => message.error('Could not save form'),
  });

  const commitRename = (f: Field) => {
    const v = renameVal.trim();
    setRenamingId(undefined);
    if (v && v !== f.label) patch.mutate({ id: f.id, body: { label: v } });
  };

  return (
    <div className="min-h-full px-6 pb-8 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
      {/* Top bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold tracking-tight text-[#0F172A]">Edit Form</h1>
        <div className="flex items-center gap-2.5">
          <button onClick={() => saveAll.mutate()} disabled={saveAll.isPending}
            className="h-10 rounded-lg bg-[#4F46E5] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-60">{saveAll.isPending ? 'Saving…' : 'Save'}</button>
          <button disabled title="Cannot delete built-in form types" className="h-10 cursor-not-allowed rounded-lg border border-[#F3F4F6] px-4 text-[14px] font-semibold text-[#D1D5DB]">Delete</button>
          <button onClick={() => router.push('/settings/forms')} className="flex h-10 items-center gap-1.5 rounded-lg border border-[#E5E7EB] px-4 text-[14px] font-semibold text-[#6B7280] hover:text-[#0F172A]"><ArrowLeft size={15} /> Back</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-6 border-b border-[#EEF2F7]">
        {(['fields', 'print'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="relative pb-3 text-[15px] font-semibold transition-colors"
            style={{ color: tab === t ? '#4F46E5' : '#6B7280' }}>
            {t === 'fields' ? 'Form Fields' : 'Print Items'}
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#4F46E5]" />}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-[#EEF2F7] bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
        {tab === 'fields' ? (
          <>
            <div className="mb-1 text-[18px] font-bold text-[#0F172A]">Clinical Features</div>
            <div className="mb-4 text-[13px] text-[#9CA3AF]">{PRETTY[formType] ?? formType} form</div>

            <button onClick={() => setAddOpen((v) => !v)} className="mb-4 flex items-center gap-2 rounded-lg border border-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#EEF3FF]">
              <Plus size={16} /> Add Clinical Feature
            </button>
            {addOpen && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] p-4">
                <Info size={18} className="mt-0.5 shrink-0 text-[#4F46E5]" />
                <div>
                  <div className="text-[14px] font-semibold text-[#0F172A]">All available fields are already configured</div>
                  <div className="mt-0.5 text-[13px] text-[#6B7280]">These forms map to fixed clinical-feature columns. Use the rows below to rename fields, set print visibility, assign print groups, reorder, or enable/disable them. Custom fields are coming soon.</div>
                </div>
              </div>
            )}

            <div className="divide-y divide-[#F3F4F6]">
              {fields.map((f, i) => {
                const Icon = f.fieldType === 'CHECKBOX' ? CheckCircle2 : TextCursorInput;
                const open = expandedId === f.id;
                return (
                  <div key={f.id} draggable onDragStart={() => (dragIndex.current = i)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)}
                    className="py-4">
                    <div className="flex items-center gap-3">
                      <GripVertical size={18} className="shrink-0 cursor-grab text-[#D1D5DB]" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] uppercase tracking-wide text-[#9CA3AF]">Label</div>
                        {renamingId === f.id ? (
                          <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onBlur={() => commitRename(f)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(f); if (e.key === 'Escape') setRenamingId(undefined); }}
                            className="mt-0.5 w-full max-w-xs rounded-md border border-[#4F46E5] px-2 py-1 text-[15px] font-semibold text-[#0F172A] outline-none" />
                        ) : (
                          <button onClick={() => { setRenamingId(f.id); setRenameVal(f.label); }} className="mt-0.5 flex items-center gap-1.5 text-left text-[15px] font-semibold text-[#0F172A] hover:text-[#4F46E5]">
                            {f.label} <Pencil size={12} className="text-[#D1D5DB]" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[#6B7280]">
                        <span className="text-[11px] uppercase tracking-wide text-[#9CA3AF]">Type</span>
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#F3F4F6]" style={{ color: f.fieldType === 'CHECKBOX' ? '#4F46E5' : '#6B7280' }}><Icon size={16} /></span>
                      </div>
                      <button onClick={() => setExpandedId(open ? undefined : f.id)} className="grid h-8 w-8 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#4F46E5]"><Pencil size={15} /></button>
                      <Toggle checked={f.enabled} onChange={(v) => { setFields((s) => s.map((x) => x.id === f.id ? { ...x, enabled: v } : x)); patch.mutate({ id: f.id, body: { enabled: v } }); }} />
                    </div>
                    {open && (
                      <div className="mt-3 ml-8 flex flex-wrap items-center gap-6 rounded-xl bg-[#F8FAFC] p-4">
                        <label className="flex items-center gap-2.5">
                          <span className="text-[13px] font-medium text-[#374151]">Show when printing results?</span>
                          <Toggle checked={f.showWhenPrinting} onChange={(v) => { setFields((s) => s.map((x) => x.id === f.id ? { ...x, showWhenPrinting: v } : x)); patch.mutate({ id: f.id, body: { showWhenPrinting: v } }); }} />
                        </label>
                        <label className="flex items-center gap-2.5">
                          <span className="text-[13px] font-medium text-[#374151]">Print Group</span>
                          <select
                            value={f.printGroupId ?? ''}
                            onChange={(e) => { const v = e.target.value || null; setFields((s) => s.map((x) => x.id === f.id ? { ...x, printGroupId: v } : x)); patch.mutate({ id: f.id, body: { printGroupId: v } }); }}
                            className="h-9 min-w-[240px] rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#4F46E5]"
                          >
                            <option value="">Choose a Print Group</option>
                            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </label>
                      </div>
                    )}
                    {!open && f.printGroupId && <div className="ml-8 mt-1 text-[12px] text-[#9CA3AF]">Print group: {groupName(f.printGroupId)}</div>}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setGroupOpen((v) => !v)} className="mb-4 flex items-center gap-2 rounded-lg border border-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#EEF3FF]">
              <Plus size={16} /> Add Print Item
            </button>
            {groupOpen && (
              <div className="mb-5 rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] p-4">
                <div className="mb-1.5 text-[13px] font-semibold text-[#0F172A]">New Group</div>
                <div className="flex items-center gap-2">
                  <input autoFocus value={newGroup} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newGroup.trim()) addGroup.mutate(newGroup.trim()); }}
                    placeholder="Group name" className="h-10 flex-1 rounded-lg border border-[#E2E8F0] px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#4F46E5]" />
                  <button onClick={() => newGroup.trim() && addGroup.mutate(newGroup.trim())} disabled={!newGroup.trim() || addGroup.isPending} className="h-10 rounded-lg bg-[#4F46E5] px-4 text-[14px] font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50">Add</button>
                  <button onClick={() => { setGroupOpen(false); setNewGroup(''); }} className="h-10 rounded-lg border border-[#E5E7EB] px-4 text-[14px] font-semibold text-[#6B7280]">Cancel</button>
                </div>
              </div>
            )}

            {groups.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#9CA3AF]">No print items yet</div>
            ) : (
              <div className="divide-y divide-[#F3F4F6]">
                {groups.map((g) => (
                  <div key={g.id} className="group flex items-center gap-3 py-4">
                    <GripVertical size={18} className="shrink-0 cursor-grab text-[#D1D5DB]" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] uppercase tracking-wide text-[#9CA3AF]">Print Item Name</div>
                      <div className="mt-0.5 text-[15px] font-semibold text-[#0F172A]">{g.name}</div>
                    </div>
                    <button
                      onClick={() => { if (window.confirm('Delete this print group? Fields assigned to this group will be unassigned.')) delGroup.mutate(g.id); }}
                      className="grid h-9 w-9 place-items-center rounded-lg text-[#D1D5DB] opacity-0 transition-opacity hover:bg-[#FEF2F2] hover:text-[#EF4444] group-hover:opacity-100">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg"
          style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors" style={{ background: checked ? '#4F46E5' : '#c7c4d8' }}>
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: checked ? 22 : 2 }} />
    </button>
  );
}
