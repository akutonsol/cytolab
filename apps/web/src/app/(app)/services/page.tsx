'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, CheckCircle2, Package, Pencil, Plus, Search, SlidersHorizontal,
  ToggleLeft, ToggleRight, Trash2, XCircle,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { DS } from '@/lib/drawer-styles';
import { IconAction } from '@/components/ui';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (cents: number) => '$' + ((cents ?? 0) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

interface Service {
  id: string; name: string; code: string; description?: string | null;
  price: number; active: boolean; createdAt: string;
}

// Deterministic per-service avatar colour (zero-orange palette).
const AVATAR = ['#4F46E5', '#0EA5E9', '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E', '#6366F1', '#0284C7'];
const colorFor = (key: string) => AVATAR[key.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function Avatar({ service, size = 40 }: { service: Service; size?: number }) {
  const c = colorFor(service.code || service.name);
  return (
    <div style={{ width: size, height: size, borderRadius: size / 3, background: `${c}1A`, color: c, display: 'grid', placeItems: 'center', flexShrink: 0, fontFamily: 'Geist,sans-serif', fontWeight: 800, fontSize: size * 0.36 }}>
      {initials(service.name)}
    </div>
  );
}
function StatusBadge({ active }: { active: boolean }) {
  return active
    ? <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold" style={{ background: '#ECFCCB', color: '#4D7C0F' }}><CheckCircle2 size={13} /> Active</span>
    : <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold" style={{ background: '#F1F5F9', color: '#475569' }}><XCircle size={13} /> Inactive</span>;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ServicesPage() {
  const qc = useQueryClient();
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'active' | 'inactive'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };
  const isEdit = !!editService;

  const { data } = useQuery<Paginated<Service>>({ queryKey: ['services'], queryFn: () => api.get('/services', { params: { pageSize: 200 } }).then((r) => r.data) });
  const services = data?.data ?? [];
  const refetch = () => qc.invalidateQueries({ queryKey: ['services'] });

  const toggleMut = useMutation({
    mutationFn: (s: Service) => api.put(`/services/update/${s.id}`, { active: !s.active }).then((r) => r.data),
    onSuccess: (_d, s) => { notify('ok', s.active ? 'Service deactivated' : 'Service activated'); refetch(); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Update failed'),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/services/delete/${id}`).then((r) => r.data),
    onSuccess: () => { notify('ok', 'Service deleted'); setConfirmId(null); refetch(); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Delete failed'),
  });

  const activeCount = services.filter((s) => s.active).length;

  const filtered = useMemo(() => {
    let rows = services;
    if (tab === 'active') rows = rows.filter((s) => s.active);
    else if (tab === 'inactive') rows = rows.filter((s) => !s.active);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((s) => `${s.name} ${s.code}`.toLowerCase().includes(q));
    }
    return rows;
  }, [services, search, tab]);

  const openAdd = () => { setEditService(null); setModalOpen(true); };
  const openEdit = (s: Service) => { setEditService(s); setModalOpen(true); };
  const th = 'px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#9CA3AF]';

  return (
    <div className="min-h-full py-8" style={{ background: '#FFFFFF' }}>
      {/* Catalog cards */}
      <div className="mb-12">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[40px] font-bold tracking-tight text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>Catalog</h2>
            <span className="rounded-lg px-3 py-1 text-[13px] font-bold" style={{ background: '#ECFCCB', color: '#4D7C0F' }}>{activeCount} ACTIVE</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => feedRef.current?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center gap-2 rounded-2xl border border-[#EAEAEA] bg-white px-5 py-3 text-[15px] font-semibold text-[#0F172A] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#FAFAFA]">Show All <ArrowRight size={16} /></button>
            <button onClick={openAdd} className="flex items-center gap-2 rounded-2xl px-6 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90" style={{ background: '#0F172A' }}><Plus size={18} /> Add Service</button>
          </div>
        </div>
        <p className="mb-6 text-[16px] text-[#6B7280]">Lab test services and pricing.</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.slice(0, 4).map((s) => (
            <button key={s.id} onClick={() => openEdit(s)} className="rounded-3xl border border-[#EDEDED] bg-white p-6 text-left shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition-[background-color,border-color,color,box-shadow,transform,opacity] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
              <div className="flex items-center gap-3.5">
                <Avatar service={s} size={46} />
                <div className="min-w-0">
                  <div className="truncate text-[18px] font-bold text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>{s.name}</div>
                  <div className="truncate font-mono text-[14px] text-[#475569]">{s.code}</div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <StatusBadge active={s.active} />
                <span className="text-[18px] font-bold text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>{fmt(s.price)}</span>
              </div>
            </button>
          ))}
          {services.length === 0 && <div className="col-span-full rounded-3xl border border-[#EDEDED] bg-white p-8 text-center text-[15px] text-[#475569]">No services yet.</div>}
        </div>
      </div>

      {/* Feed */}
      <div ref={feedRef}>
        <h2 className="text-[40px] font-bold tracking-tight text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>Services</h2>
        <p className="mb-6 text-[16px] text-[#6B7280]">Manage lab test services and pricing.</p>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex gap-1 rounded-2xl border border-[#EDEDED] bg-white p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {([['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} className="rounded-xl px-5 py-2.5 text-[15px] font-semibold transition-colors" style={{ background: tab === v ? '#F1F1EF' : 'transparent', color: tab === v ? '#0F172A' : '#475569' }}>{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-[280px] items-center gap-2 rounded-2xl border border-[#EDEDED] bg-white px-4 text-[#9CA3AF] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <Search size={18} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="w-full border-none bg-transparent text-[15px] text-[#0F172A] outline-none placeholder:text-[#9CA3AF]" />
            </div>
            <button className="flex h-12 items-center gap-2 rounded-2xl border border-[#EDEDED] bg-white px-5 text-[15px] font-semibold text-[#0F172A] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"><SlidersHorizontal size={16} /> Filters</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-[#EDEDED] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <Package size={48} className="text-[#E2E8F0]" />
              <div className="text-[16px] font-semibold text-[#475569]">No services found</div>
              <div className="text-[13px] text-[#475569]">Add your first lab service to start billing</div>
              <button onClick={openAdd} className="mt-2 flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: '#0F172A' }}><Plus size={15} /> Add Service</button>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#F1F1EF]">
                  <th className={th}>Service</th><th className={th}>Code</th><th className={`${th} text-right`}>Price</th><th className={th}>Status</th><th className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const desc = s.description ?? '';
                  const confirming = confirmId === s.id;
                  return (
                    <tr key={s.id} className="border-b border-[#F4F4F2] transition-colors last:border-0 hover:bg-[#FAFAF9]">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3.5">
                          <Avatar service={s} size={44} />
                          <div className="min-w-0">
                            <div className="text-[16px] font-semibold text-[#0F172A]">{s.name}</div>
                            <div className="truncate text-[13px] text-[#475569]" title={desc} style={{ maxWidth: 320 }}>{desc || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5"><span className="rounded-md px-2.5 py-1 font-mono text-[14px] font-bold" style={{ background: '#F1F1EF', color: '#4F46E5' }}>{s.code}</span></td>
                      <td className="px-6 py-5 text-right text-[16px] font-bold text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>{fmt(s.price)}</td>
                      <td className="px-6 py-5"><StatusBadge active={s.active} /></td>
                      <td className="px-6 py-5">
                        {confirming ? (
                          <div className="flex items-center justify-end gap-2 text-[12px]">
                            <span className="text-[#475569]">Delete?</span>
                            <button onClick={() => delMut.mutate(s.id)} disabled={delMut.isPending} className="rounded-lg px-3 py-1 font-semibold text-white" style={{ background: '#DC2626' }}>Delete</button>
                            <button onClick={() => setConfirmId(null)} className="rounded-lg border border-[#E2E8F0] px-3 py-1 font-semibold text-[#475569]">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <IconAction icon={<Pencil size={15} />} tone="strong" size="lg" shape="soft" className="hover:bg-[#F5F7FF] border border-[#EEF0EE] hover:text-[#4F46E5]" title="Edit" onClick={() => openEdit(s)} />
                            <button title={s.active ? 'Deactivate' : 'Activate'} onClick={() => toggleMut.mutate(s)} disabled={toggleMut.isPending} className="grid h-9 w-9 place-items-center rounded-xl border border-[#EEF0EE] transition-colors hover:bg-[#F5F7FF]" style={{ color: s.active ? '#4F46E5' : '#475569' }}>{s.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}</button>
                            <IconAction icon={<Trash2 size={15} />} tone="strong" size="lg" shape="soft" className="hover:bg-[#FEF2F2] border border-[#EEF0EE] hover:text-[#DC2626]" title="Delete" onClick={() => setConfirmId(s.id)} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ServiceModal open={modalOpen} service={editService} isEdit={isEdit} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); refetch(); notify('ok', isEdit ? 'Service updated' : 'Service created'); }} onError={(m) => notify('err', m)} />

      {toast && <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>}
    </div>
  );
}

// ─── Add / Edit modal ────────────────────────────────────────────────────────
function ServiceModal({ open, service, isEdit, onClose, onSaved, onError }: {
  open: boolean; service: Service | null; isEdit: boolean;
  onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (service) {
      setName(service.name); setCode(service.code); setDescription(service.description ?? '');
      setPriceStr((service.price / 100).toFixed(2)); setActive(service.active);
    } else {
      setName(''); setCode(''); setDescription(''); setPriceStr(''); setActive(true);
    }
  }, [open, service]);

  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), code: code.trim(), description: description.trim() || undefined, price: Math.round(parseFloat(priceStr || '0') * 100), active };
      return isEdit && service
        ? api.put(`/services/update/${service.id}`, payload).then((r) => r.data)
        : api.post('/services', payload).then((r) => r.data);
    },
    onSuccess: onSaved,
    onError: (e: any) => onError(e?.response?.data?.message ?? 'Save failed'),
  });

  const canSave = !!name.trim() && !!code.trim() && !save.isPending;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: open ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#EEF2F8', borderRadius: 20, padding: 0, width: 520, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.18)' }}>
      <div style={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Geist, sans-serif', fontSize: 20, fontWeight: 700, color: '#0F172A' }}>{isEdit ? 'Edit Service' : 'Add Service'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={DS.btnClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={DS.label}>Service Name<span style={{ color: '#DC2626' }}> *</span></label>
            <input style={DS.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pap Smear Analysis" />
          </div>
          <div>
            <label style={DS.label}>Service Code<span style={{ color: '#DC2626' }}> *</span></label>
            <input style={DS.input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. PAP-001" />
            <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Unique identifier for billing</div>
          </div>
          <div>
            <label style={DS.label}>Description</label>
            <textarea style={{ ...DS.input, height: 80, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the service…" />
          </div>
          <div>
            <label style={DS.label}>Price<span style={{ color: '#DC2626' }}> *</span></label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#475569' }}>$</span>
              <input type="number" min="0" step="0.01" style={DS.input} value={priceStr} onChange={(e) => setPriceStr(e.target.value)} placeholder="0.00" />
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Price in dollars (e.g. 1.20 = $1.20)</div>
          </div>
          <div style={DS.toggleRow}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Active</span>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#4F46E5' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #E2E8F0', padding: '16px 28px' }}>
        <button type="button" style={DS.btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" style={{ ...DS.btnPrimary, opacity: canSave ? 1 : 0.5 }} disabled={!canSave} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Service'}</button>
      </div>
      </div>
    </div>
  );
}
