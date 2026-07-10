'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Wrench, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import { EQUIPMENT_TYPES, type Equipment } from '@/lib/qc';
import { IconAction, EmptyState } from '@/components/ui';

const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#4F46E5]';

function EquipmentModal({ item, onClose }: { item: Equipment | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [name, setName] = useState(item?.name ?? '');
  const [type, setType] = useState(item?.type ?? 'Stainer');
  const [serialNumber, setSerial] = useState(item?.serialNumber ?? '');
  const [lastServiceDate, setLastService] = useState(item?.lastServiceDate ? item.lastServiceDate.slice(0, 10) : '');
  const [isActive, setActive] = useState(item?.isActive ?? true);

  const save = useMutation({
    mutationFn: () => {
      const body = { name, type, serialNumber: serialNumber || undefined, lastServiceDate: lastServiceDate || undefined, isActive };
      return item ? api.patch(`/equipment/${item.id}`, body) : api.post('/equipment', body);
    },
    onSuccess: () => { message.success(item ? 'Equipment updated' : 'Equipment added'); qc.invalidateQueries({ queryKey: ['equipment-list'] }); qc.invalidateQueries({ queryKey: ['qc-equipment'] }); onClose(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Save failed'),
  });

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2100, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[460px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <h3 className="text-[18px] font-bold text-[#0F172A]">{item ? 'Edit Equipment' : 'Add Equipment'}</h3>
          <IconAction icon={<X size={16} />} tone="strong" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <F label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="e.g. Stainer Unit 2" /></F>
          <F label="Type"><select value={type} onChange={(e) => setType(e.target.value as any)} className={inp}>{EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></F>
          <F label="Serial Number"><input value={serialNumber} onChange={(e) => setSerial(e.target.value)} className={inp} /></F>
          <F label="Last Service Date"><input type="date" value={lastServiceDate} onChange={(e) => setLastService(e.target.value)} className={inp} /></F>
          <label className="mt-2 flex items-center gap-2 text-[14px] text-[#334155]"><input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} style={{ accentColor: '#4F46E5' }} /> Active</label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569]">Cancel</button>
          <button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-3.5"><label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#475569]">{label}</label>{children}</div>
);

export default function EquipmentPage() {
  const { can } = useAuth();
  const { isEnabled } = useFeatures();
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const enabled = isEnabled('QC_MODULE');
  const canEdit = can('record:change');
  const [modalItem, setModalItem] = useState<Equipment | null | 'new'>(null);

  const { data: list = [] } = useQuery<Equipment[]>({ queryKey: ['equipment-list'], queryFn: () => api.get('/equipment').then((r) => r.data), enabled });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/${id}`),
    onSuccess: () => { message.success('Equipment deactivated'); qc.invalidateQueries({ queryKey: ['equipment-list'] }); },
    onError: () => message.error('Delete failed'),
  });

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <EmptyState className="mt-16"
              icon={<Wrench size={28} />}
              title={<>Feature not enabled</>}
              description={<>Quality Control is disabled for this lab.</>}
            />
      </div>
    );
  }

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Equipment</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Lab instruments tracked for quality control.</p>
        </div>
        {canEdit && <button onClick={() => setModalItem('new')} className="flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white"><Plus size={16} /> Add Equipment</button>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <table className="w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#475569]">
              <th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Serial</th><th className="px-4 py-3 font-semibold">Last Service</th>
              <th className="px-4 py-3 font-semibold">Checks</th><th className="px-4 py-3 font-semibold">Status</th>
              {canEdit && <th className="px-4 py-3 font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-[#475569]">No equipment yet.</td></tr>
            ) : list.map((e) => (
              <tr key={e.id} className="border-b border-[#F1F5F9]" style={e.isActive ? undefined : { opacity: 0.55 }}>
                <td className="px-4 py-3 font-semibold text-[#0F172A]">{e.name}</td>
                <td className="px-4 py-3 text-[#334155]">{e.type}</td>
                <td className="px-4 py-3 text-[#475569]">{e.serialNumber ?? '—'}</td>
                <td className="px-4 py-3 text-[#475569]">{e.lastServiceDate ? new Date(e.lastServiceDate).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-[#475569]">{e._count?.qcChecks ?? 0}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold" style={e.isActive ? { background: '#DCFCE7', color: '#16A34A' } : { background: '#F1F5F9', color: '#475569' }}>{e.isActive ? 'Active' : 'Inactive'}</span>
                </td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => setModalItem(e)} className="rounded-md bg-[#EEF2FF] px-2.5 py-1 text-[12px] font-semibold text-[#4F46E5]">Edit</button>
                      {e.isActive && <button onClick={() => modal.confirm({ title: `Deactivate ${e.name}?`, content: 'It will be hidden from new QC checks. History is preserved.', okText: 'Deactivate', okButtonProps: { danger: true }, onOk: () => del.mutate(e.id) })} className="rounded-md bg-[#FEF2F2] px-2.5 py-1 text-[12px] font-semibold text-[#DC2626]">Deactivate</button>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalItem !== null && <EquipmentModal item={modalItem === 'new' ? null : modalItem} onClose={() => setModalItem(null)} />}
    </div>
  );
}
