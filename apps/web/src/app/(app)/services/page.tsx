'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Package, Pencil, Plus, ToggleLeft, ToggleRight, Trash2, XCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import {
  Avatar, Badge, Button, Card, cn, DataToolbar, EmptyState, Field, fieldClass, IconAction,
  Input, Modal, PageHeader, SearchField, SkeletonRows, StatCard, Td, Th,
} from '@/components/ui';
import { notify } from '@/lib/notify';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (cents: number) => '$' + ((cents ?? 0) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

interface Service {
  id: string; name: string; code: string; description?: string | null;
  price: number; active: boolean; createdAt: string;
}

function StatusBadge({ active }: { active: boolean }) {
  return active
    ? <Badge tone="success" className="gap-1"><CheckCircle2 size={13} /> Active</Badge>
    : <Badge tone="neutral" className="gap-1"><XCircle size={13} /> Inactive</Badge>;
}

const TABS = [['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']] as const;

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ServicesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'active' | 'inactive'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const isEdit = !!editService;

  const { data, isLoading } = useQuery<Paginated<Service>>({ queryKey: ['services'], queryFn: () => api.get('/services', { params: { pageSize: 200 } }).then((r) => r.data) });
  const services = data?.data ?? [];
  const refetch = () => qc.invalidateQueries({ queryKey: ['services'] });

  const toggleMut = useMutation({
    mutationFn: (s: Service) => api.put(`/services/update/${s.id}`, { active: !s.active }).then((r) => r.data),
    onSuccess: (_d, s) => { notify.success(s.active ? 'Service deactivated' : 'Service activated'); refetch(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Update failed'),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/services/delete/${id}`).then((r) => r.data),
    onSuccess: () => { notify.success('Service deleted'); setConfirmId(null); refetch(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Delete failed'),
  });

  const activeCount = services.filter((s) => s.active).length;
  const avgPrice = services.length ? Math.round(services.reduce((a, s) => a + (s.price ?? 0), 0) / services.length) : 0;

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

  return (
    <div className="w-full">
      <PageHeader
        title="Services"
        description="Manage lab test services and pricing."
        actions={<Button onClick={openAdd}><Plus size={16} /> Add Service</Button>}
      />

      {/* Summary — derived counts, not a duplicate of the table below. */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total services" value={services.length} />
        <StatCard label="Active" value={activeCount} active={activeCount > 0} />
        <StatCard label="Inactive" value={services.length - activeCount} />
        <StatCard label="Avg price" value={fmt(avgPrice)} />
      </div>

      {/* Toolbar — status tabs + search (page owns the filter state). */}
      <DataToolbar
        className="mb-4"
        leading={
          <div className="inline-flex gap-1 rounded-xl border border-card bg-surface p-1">
            {TABS.map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={tab === v}
                onClick={() => setTab(v)}
                className={cn(
                  'rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors',
                  tab === v ? 'bg-surface-alt text-text' : 'text-text-secondary hover:text-text',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        }
        trailing={
          <SearchField
            label="Search services"
            hideLabel
            className="sm:w-72"
            inputProps={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: 'Search name or code' }}
          />
        }
      />

      <Card radius="md" elevation="sm" border="hairline" padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" aria-label="Services">
            <thead>
              <tr className="border-b border-card">
                <Th>Service</Th>
                <Th>Code</Th>
                <Th className="text-right">Price</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows rows={6} columns={5} />
              ) : filtered.length === 0 ? (
                <tr>
                  <Td colSpan={5}>
                    <EmptyState
                      bare
                      className="py-16"
                      icon={<Package size={28} />}
                      title="No services found"
                      description={search || tab !== 'all' ? 'No services match the current filters.' : 'Add your first lab service to start billing.'}
                      action={<Button variant="secondary" onClick={openAdd}><Plus size={15} /> Add Service</Button>}
                    />
                  </Td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const desc = s.description ?? '';
                  const confirming = confirmId === s.id;
                  return (
                    <tr key={s.id} className="border-b border-card transition-colors last:border-0 hover:bg-surface-alt">
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={s.name} size={40} />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-charcoal-heading">{s.name}</div>
                            <div className="truncate text-meta text-text-tertiary" title={desc} style={{ maxWidth: 320 }}>{desc || '—'}</div>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <span className="rounded-md bg-surface-alt px-2 py-1 font-mono text-sm font-semibold text-primary">{s.code}</span>
                      </Td>
                      <Td className="text-right text-sm font-bold text-charcoal-heading">{fmt(s.price)}</Td>
                      <Td><StatusBadge active={s.active} /></Td>
                      <Td>
                        {confirming ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-meta text-text-secondary">Delete?</span>
                            <Button variant="danger" size="sm" loading={delMut.isPending} onClick={() => delMut.mutate(s.id)}>Delete</Button>
                            <Button variant="secondary" size="sm" onClick={() => setConfirmId(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <IconAction icon={<Pencil size={15} />} tone="muted" aria-label={`Edit ${s.name}`} onClick={() => openEdit(s)} />
                            <IconAction
                              icon={s.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                              tone="muted"
                              aria-label={s.active ? `Deactivate ${s.name}` : `Activate ${s.name}`}
                              disabled={toggleMut.isPending}
                              onClick={() => toggleMut.mutate(s)}
                            />
                            <IconAction icon={<Trash2 size={15} />} tone="muted" aria-label={`Delete ${s.name}`} onClick={() => setConfirmId(s.id)} />
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ServiceModal
        open={modalOpen}
        service={editService}
        isEdit={isEdit}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); refetch(); notify.success(isEdit ? 'Service updated' : 'Service created'); }}
        onError={(m) => notify.error(m)}
      />
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
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={isEdit ? 'Edit Service' : 'Add Service'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
            {isEdit ? 'Save Changes' : 'Create Service'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Service Name" htmlFor="svc-name" required>
          <Input id="svc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pap Smear Analysis" />
        </Field>
        <Field label="Service Code" htmlFor="svc-code" required description="Unique identifier for billing">
          <Input id="svc-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. PAP-001" />
        </Field>
        <Field label="Description" htmlFor="svc-desc">
          <textarea
            id="svc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the service…"
            className={cn(fieldClass({ inputSize: 'auto' }), 'h-20 resize-y')}
          />
        </Field>
        <Field label="Price" htmlFor="svc-price" required description="Price in dollars (e.g. 1.20 = $1.20)">
          <Input id="svc-price" addon="$" type="number" min="0" step="0.01" value={priceStr} onChange={(e) => setPriceStr(e.target.value)} placeholder="0.00" />
        </Field>
        <label htmlFor="svc-active" className="flex items-center justify-between rounded-xl border border-card bg-surface px-4 py-3">
          <span className="text-sm font-semibold text-text">Active</span>
          <input id="svc-active" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-[18px] w-[18px] accent-primary" />
        </label>
      </div>
    </Modal>
  );
}
