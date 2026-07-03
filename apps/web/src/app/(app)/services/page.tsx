'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from 'antd';
import {
  CheckCircle2, DollarSign, Package, Pencil, Plus, Search, ToggleLeft, ToggleRight,
  Trash2, TrendingUp, XCircle,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { DS } from '@/lib/drawer-styles';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (cents: number) => '$' + ((cents ?? 0) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const CARD = 'rounded-[20px] border border-[#EEF2F7] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]';

interface Service {
  id: string; name: string; code: string; description?: string | null;
  price: number; active: boolean; createdAt: string;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ServicesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };
  const isEdit = !!editService;

  const { data } = useQuery<Paginated<Service>>({ queryKey: ['services'], queryFn: () => api.get('/services', { params: { pageSize: 200 } }).then((r) => r.data) });
  const services = data?.data ?? [];
  const refetch = () => qc.invalidateQueries({ queryKey: ['services'] });

  // ── Row mutations ──
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

  // ── KPIs ──
  const activeCount = services.filter((s) => s.active).length;
  const avgPrice = services.length ? Math.round(services.reduce((s, sv) => s + sv.price, 0) / services.length) : 0;
  const minPrice = services.length ? Math.min(...services.map((s) => s.price)) : 0;
  const maxPrice = services.length ? Math.max(...services.map((s) => s.price)) : 0;

  const kpis = [
    { icon: Package, label: 'Total Services', value: String(services.length), sub: `${activeCount} active` },
    { icon: DollarSign, label: 'Avg Price', value: services.length ? fmt(avgPrice) : '$0.00', sub: 'per service' },
    { icon: TrendingUp, label: 'Price Range', value: services.length ? `${fmt(minPrice)} – ${fmt(maxPrice)}` : '—', sub: 'min – max' },
  ];

  // ── Filters ──
  const filtered = useMemo(() => {
    let rows = services;
    const status = activeOnly ? 'active' : statusFilter;
    if (status === 'active') rows = rows.filter((s) => s.active);
    else if (status === 'inactive') rows = rows.filter((s) => !s.active);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((s) => `${s.name} ${s.code}`.toLowerCase().includes(q));
    }
    return rows;
  }, [services, search, statusFilter, activeOnly]);

  const openAdd = () => { setEditService(null); setModalOpen(true); };
  const openEdit = (s: Service) => { setEditService(s); setModalOpen(true); };

  const th = 'px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[#94A3B8]';

  return (
    <div className="min-h-full p-8" style={{ background: '#F8FAFC' }}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>Services Catalog</h1>
          <p className="mt-1.5 text-[14px] text-[#6B7280]">Lab test services and pricing</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-[240px] items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 text-[#9CA3AF]">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or code…" className="w-full border-none bg-transparent text-[14px] text-[#0F172A] outline-none placeholder:text-[#9CA3AF]" />
          </div>
          <button onClick={openAdd} className="flex items-center gap-1.5 rounded-[10px] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#4338CA]" style={{ background: '#4F46E5' }}><Plus size={16} /> Add Service</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className={`${CARD} flex items-center gap-4 p-5`}>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#EEF2FF]"><Icon size={20} color="#4F46E5" /></div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">{label}</div>
              <div className="mt-0.5 text-[20px] font-extrabold leading-tight text-[#0F172A]" style={{ fontFamily: 'Geist,sans-serif' }}>{value}</div>
              <div className="mt-0.5 text-[12px] font-semibold text-[#94A3B8]">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Services table */}
      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F5F9] px-6 py-4">
          <h2 className="text-[16px] font-semibold text-[#0F172A]">Services · {filtered.length}</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setActiveOnly((v) => !v)} className="flex items-center gap-1.5 text-[13px] font-medium text-[#64748B]">
              {activeOnly ? <ToggleRight size={22} color="#4F46E5" /> : <ToggleLeft size={22} color="#94A3B8" />} Active only
            </button>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} disabled={activeOnly} className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[13px] font-medium text-[#374151] outline-none focus:border-[#4F46E5] disabled:opacity-50">
              <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Package size={48} className="text-[#E2E8F0]" />
            <div className="text-[16px] font-semibold text-[#64748B]">No services yet</div>
            <div className="text-[13px] text-[#94A3B8]">Add your first lab service to start billing</div>
            <button onClick={openAdd} className="mt-2 flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white" style={{ background: '#4F46E5' }}><Plus size={15} /> Add Service</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#F1F5F9]">
                  <th className={th}>Code</th><th className={th}>Name</th><th className={th}>Description</th>
                  <th className={`${th} text-right`}>Price</th><th className={th}>Status</th><th className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const desc = s.description ?? '';
                  const confirming = confirmId === s.id;
                  return (
                    <tr key={s.id} className="border-b border-[#F8FAFC] transition-colors hover:bg-[#F9FAFB]">
                      <td className="px-6 py-3.5"><span className="rounded-md px-2 py-1 font-mono text-[13px] font-bold" style={{ background: '#EEF2FF', color: '#4F46E5' }}>{s.code}</span></td>
                      <td className="px-6 py-3.5 text-[14px] font-semibold text-[#0F172A]">{s.name}</td>
                      <td className="px-6 py-3.5 text-[13px] text-[#64748B]" title={desc}>{desc.length > 60 ? `${desc.slice(0, 60)}…` : (desc || '—')}</td>
                      <td className="px-6 py-3.5 text-right text-[14px] font-bold text-[#0F172A]">{fmt(s.price)}</td>
                      <td className="px-6 py-3.5">
                        {s.active
                          ? <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-bold" style={{ background: '#F0FDF4', color: '#16A34A' }}><CheckCircle2 size={13} /> Active</span>
                          : <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-bold" style={{ background: '#F1F5F9', color: '#94A3B8' }}><XCircle size={13} /> Inactive</span>}
                      </td>
                      <td className="px-6 py-3.5">
                        {confirming ? (
                          <div className="flex items-center justify-end gap-2 text-[12px]">
                            <span className="text-[#64748B]">Delete?</span>
                            <button onClick={() => delMut.mutate(s.id)} disabled={delMut.isPending} className="rounded-lg px-3 py-1 font-semibold text-white" style={{ background: '#DC2626' }}>Delete</button>
                            <button onClick={() => setConfirmId(null)} className="rounded-lg border border-[#E2E8F0] px-3 py-1 font-semibold text-[#64748B]">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button title="Edit" onClick={() => openEdit(s)} className="grid h-8 w-8 place-items-center rounded-full border border-[#EEF2F7] text-[#64748B] transition-colors hover:bg-[#F5F7FF] hover:text-[#4F46E5]"><Pencil size={14} /></button>
                            <button title={s.active ? 'Deactivate' : 'Activate'} onClick={() => toggleMut.mutate(s)} disabled={toggleMut.isPending} className="grid h-8 w-8 place-items-center rounded-full border border-[#EEF2F7] transition-colors hover:bg-[#F5F7FF]" style={{ color: s.active ? '#4F46E5' : '#94A3B8' }}>{s.active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}</button>
                            <button title="Delete" onClick={() => setConfirmId(s.id)} className="grid h-8 w-8 place-items-center rounded-full border border-[#EEF2F7] text-[#64748B] transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626]"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
    <Modal open={open} onCancel={onClose} width={520} centered destroyOnHidden footer={null} closable={false}
      styles={{
        content: { background: '#EEF2F8', borderRadius: 20, padding: 0 },
        mask: { backdropFilter: 'blur(8px)', background: 'rgba(15,23,42,0.4)' },
        header: { display: 'none' }, body: { padding: 0 },
      }}>
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
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Unique identifier for billing</div>
          </div>
          <div>
            <label style={DS.label}>Description</label>
            <textarea style={{ ...DS.input, height: 80, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the service…" />
          </div>
          <div>
            <label style={DS.label}>Price<span style={{ color: '#DC2626' }}> *</span></label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#64748B' }}>$</span>
              <input type="number" min="0" step="0.01" style={DS.input} value={priceStr} onChange={(e) => setPriceStr(e.target.value)} placeholder="0.00" />
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Price in dollars (e.g. 1.20 = $1.20)</div>
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
    </Modal>
  );
}
