'use client';

import { useEffect, useState } from 'react';
import { Building2, FileText, Layers, MoreHorizontal, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { Button, IconAction } from '@/components/ui';

interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  users: { id: string; firstName: string; lastName: string }[];
  _count: { users: number; records: number; clients: number };
}

// Deterministic per-name tint from a small brand palette (zero orange).
const TINTS: { bg: string; fg: string }[] = [
  { bg: '#EEF2FF', fg: '#4F46E5' },
  { bg: '#F0FDF4', fg: '#16A34A' },
  { bg: '#FFF1F2', fg: '#E11D48' },
  { bg: '#F0F9FF', fg: '#0284C7' },
  { bg: '#F5F3FF', fg: '#7C3AED' },
];
const tintFor = (name: string) => TINTS[(name || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
const initials = (name: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const userInitials = (u: { firstName: string; lastName: string }) => `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase() || '?';
const fmtCreated = (iso: string) => `Created ${new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;

export default function WorkspacesPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Workspace | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };

  const { data } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.get<Paginated<Workspace>>('/workspaces', { params: { pageSize: 100 } }).then((r) => r.data),
  });
  const workspaces = data?.data ?? [];
  const refetch = () => qc.invalidateQueries({ queryKey: ['workspaces'] });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/workspaces/delete/${id}`),
    onSuccess: () => { notify('ok', 'Workspace deleted'); setConfirm(null); refetch(); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Delete failed'),
  });

  const totalUsers = workspaces.reduce((s, w) => s + w._count.users, 0);
  const totalRecords = workspaces.reduce((s, w) => s + w._count.records, 0);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (w: Workspace) => { setEditing(w); setModalOpen(true); setMenuId(null); };
  const askDelete = (w: Workspace) => { setMenuId(null); setConfirm(w); };

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="py-8">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-charcoal-heading">Workspaces</h1>
            <p className="mt-1 font-body-sm text-body-sm text-secondary">Departments and branches within your lab.</p>
          </div>
          <Button onClick={openCreate}><Plus size={16} /> New Workspace</Button>
        </div>

        {/* KPI strip */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { icon: Layers, label: 'Total Workspaces', value: workspaces.length, color: '#4F46E5' },
            { icon: Users, label: 'Total Users', value: totalUsers, color: '#16A34A' },
            { icon: FileText, label: 'Total Records', value: totalRecords, color: '#0284C7' },
          ].map((k) => (
            <div key={k.label} className="glass-card flex items-center gap-3.5 rounded-2xl p-6">
              <span style={{ background: `${k.color}15`, color: k.color }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"><k.icon size={20} /></span>
              <div>
                <div className="font-display text-[30px] font-bold leading-none text-[#0F172A]">{k.value}</div>
                <div className="mt-1 font-label-sm text-label-sm text-secondary uppercase tracking-wider">{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Grid / empty */}
        {workspaces.length === 0 ? (
          <div className="glass-card flex flex-col items-center justify-center gap-3 rounded-2xl py-20 text-center">
            <Layers size={48} className="text-[#E2E8F0]" />
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">No workspaces yet</h3>
            <p className="max-w-xs font-body-sm text-body-sm text-secondary">Create your first workspace to organize users and records.</p>
            <Button className="mt-1" onClick={openCreate}><Plus size={16} /> New Workspace</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {workspaces.map((w) => {
              const t = tintFor(w.name);
              return (
                <div key={w.id} className="glass-card rounded-2xl p-6 transition-[background-color,border-color,color,box-shadow,transform,opacity] hover:border-primary/30">
                  {/* Top */}
                  <div className="flex items-start justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span style={{ background: t.bg, color: t.fg }} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-label-md text-label-md font-bold">{initials(w.name)}</span>
                      <span className="truncate font-headline-sm text-headline-sm text-charcoal-heading">{w.name}</span>
                    </div>
                    <div className="relative shrink-0">
                      <IconAction icon={<MoreHorizontal size={16} />} tone="strong" className="hover:bg-surface-container-low text-secondary" onClick={() => setMenuId(menuId === w.id ? null : w.id)} />
                      {menuId === w.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                          <div className="absolute right-0 z-20 mt-1 w-36 rounded-xl border border-outline-variant/30 bg-white p-1 shadow-lg">
                            <button onClick={() => openEdit(w)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low"><Pencil size={14} /> Edit</button>
                            <button onClick={() => askDelete(w)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-body-sm text-body-sm text-error hover:bg-error-container"><Trash2 size={14} /> Delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#F1F0EA] pt-4">
                    {[
                      { icon: Users, count: w._count.users, label: 'users' },
                      { icon: FileText, count: w._count.records, label: 'records' },
                      { icon: Building2, count: w._count.clients, label: 'clients' },
                    ].map((s) => (
                      <div key={s.label} className="flex flex-col items-center gap-1">
                        <s.icon size={16} className="text-secondary" />
                        <div className="font-headline-sm text-headline-sm text-charcoal-heading">{s.count}</div>
                        <div className="font-label-sm text-label-sm text-secondary">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-body-sm text-body-sm text-secondary">{fmtCreated(w.createdAt)}</span>
                    {w._count.users > 0 && (
                      <div className="flex -space-x-2">
                        {w.users.slice(0, 3).map((u) => {
                          const ut = tintFor(u.firstName + u.lastName);
                          return (
                            <span key={u.id} title={`${u.firstName} ${u.lastName}`} style={{ background: ut.bg, color: ut.fg }}
                              className="grid h-7 w-7 place-items-center rounded-full border-2 border-white font-label-sm text-label-sm font-bold">{userInitials(u)}</span>
                          );
                        })}
                        {w._count.users > 3 && <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-surface-container font-label-sm text-label-sm text-secondary">+{w._count.users - 3}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <WorkspaceModal
          workspace={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); refetch(); notify('ok', editing ? 'Workspace updated' : 'Workspace created'); }}
          onError={(m) => notify('err', m)}
        />
      )}

      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => setConfirm(null)}>
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Delete “{confirm.name}”?</h3>
            {confirm._count.users + confirm._count.records + confirm._count.clients > 0 ? (
              <p className="mt-2 font-body-sm text-body-sm text-error">
                Cannot delete — reassign {[confirm._count.users && `${confirm._count.users} users`, confirm._count.records && `${confirm._count.records} records`, confirm._count.clients && `${confirm._count.clients} clients`].filter(Boolean).join(', ')} first.
              </p>
            ) : (
              <p className="mt-2 font-body-sm text-body-sm text-secondary">This workspace is empty and will be permanently deleted.</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button style={{ background: '#DC2626', boxShadow: '0 4px 12px rgba(220,38,38,0.2)', opacity: confirm._count.users + confirm._count.records + confirm._count.clients > 0 ? 0.5 : 1 }}
                disabled={confirm._count.users + confirm._count.records + confirm._count.clients > 0 || del.isPending}
                onClick={() => del.mutate(confirm.id)}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>
      )}
    </div>
  );
}

function WorkspaceModal({ workspace, onClose, onSaved, onError }: { workspace: Workspace | null; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState(workspace?.name ?? '');
  useEffect(() => { setName(workspace?.name ?? ''); }, [workspace]);

  const save = useMutation({
    mutationFn: () => (workspace
      ? api.put(`/workspaces/update/${workspace.id}`, { name: name.trim() })
      : api.post('/workspaces', { name: name.trim() })),
    onSuccess: onSaved,
    onError: (e: any) => onError(e?.response?.data?.message ?? 'Save failed'),
  });
  const canSave = !!name.trim() && !save.isPending;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-[460px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">{workspace ? 'Edit Workspace' : 'New Workspace'}</h3>
          <IconAction icon={<X size={16} />} tone="strong" className="hover:bg-surface-container-low text-secondary" onClick={onClose} />
        </div>
        <label className="mb-1.5 block font-label-md text-label-md text-on-surface">Workspace Name<span className="text-error"> *</span></label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canSave) save.mutate(); }}
          placeholder="e.g. Cytology Department"
          className="h-11 w-full rounded-xl border border-outline-variant/40 bg-white px-3.5 font-body-sm text-body-sm text-on-surface outline-none transition-colors focus:border-primary" />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSave} style={{ opacity: canSave ? 1 : 0.5 }} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : workspace ? 'Save Changes' : 'Create Workspace'}
          </Button>
        </div>
      </div>
    </div>
  );
}
