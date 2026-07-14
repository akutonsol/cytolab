'use client';

import { useState } from 'react';
import { Building2, MoreHorizontal, Pencil, Plus, Trash2, UserCircle, Users, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { Button, Field, IconAction } from '@/components/ui';
import { notify } from '@/lib/notify';

interface Dept {
  id: string;
  name: string;
  description: string | null;
  managerId: string | null;
  manager: { id: string; firstName: string; lastName: string } | null;
  _count: { employees: number };
  createdAt: string;
}
interface UserLite { id: string; firstName: string; lastName: string }

const TINTS = [
  { bg: '#EEF2FF', fg: '#4F46E5' }, { bg: '#F0FDF4', fg: '#16A34A' },
  { bg: '#FFF1F2', fg: '#E11D48' }, { bg: '#F0F9FF', fg: '#0284C7' }, { bg: '#F5F3FF', fg: '#7C3AED' },
];
const tintFor = (s: string) => TINTS[(s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
const initials = (s: string) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default function DepartmentsPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Dept | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Dept | null>(null);

  const { data } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<Paginated<Dept>>('/departments', { params: { pageSize: 200 } }).then((r) => r.data),
  });
  const depts = data?.data ?? [];
  const refetch = () => qc.invalidateQueries({ queryKey: ['departments'] });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/departments/delete/${id}`),
    onSuccess: () => { notify.success('Department deleted'); setConfirm(null); refetch(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Delete failed'),
  });

  const totalEmployees = depts.reduce((s, d) => s + d._count.employees, 0);
  const withManager = depts.filter((d) => d.managerId).length;

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (d: Dept) => { setEditing(d); setModalOpen(true); setMenuId(null); };

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-charcoal-heading">Departments</h1>
            <p className="mt-1 font-body-sm text-body-sm text-secondary">Teams and branches within your lab.</p>
          </div>
          <Button onClick={openCreate}><Plus size={16} /> New Department</Button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { icon: Building2, label: 'Departments', value: depts.length, color: '#4F46E5' },
            { icon: Users, label: 'Total Employees', value: totalEmployees, color: '#16A34A' },
            { icon: UserCircle, label: 'With a Manager', value: withManager, color: '#0284C7' },
          ].map((k) => (
            <div key={k.label} className="glass-card flex items-center gap-3.5 rounded-2xl p-6">
              <span style={{ background: `${k.color}15`, color: k.color }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"><k.icon size={20} /></span>
              <div>
                <div className="font-display text-[30px] font-bold leading-none text-[#0F172A]">{k.value}</div>
                <div className="mt-1 font-label-sm text-label-sm uppercase tracking-wider text-secondary">{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {depts.length === 0 ? (
          <div className="glass-card flex flex-col items-center justify-center gap-3 rounded-2xl py-20 text-center">
            <Building2 size={48} className="text-[#E2E8F0]" />
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">No departments yet</h3>
            <p className="max-w-xs font-body-sm text-body-sm text-secondary">Create departments to organize your staff.</p>
            <Button className="mt-1" onClick={openCreate}><Plus size={16} /> New Department</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {depts.map((d) => {
              const t = tintFor(d.name);
              return (
                <div key={d.id} className="glass-card rounded-2xl p-6 transition-[background-color,border-color,color,box-shadow,transform,opacity] hover:border-primary/30">
                  <div className="flex items-start justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span style={{ background: t.bg, color: t.fg }} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-label-md text-label-md font-bold">{initials(d.name)}</span>
                      <span className="truncate font-headline-sm text-headline-sm text-charcoal-heading">{d.name}</span>
                    </div>
                    <div className="relative shrink-0">
                      <IconAction icon={<MoreHorizontal size={16} />} tone="strong" className="hover:bg-surface-container-low text-secondary" onClick={() => setMenuId(menuId === d.id ? null : d.id)} />
                      {menuId === d.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                          <div className="absolute right-0 z-20 mt-1 w-36 rounded-xl border border-outline-variant/30 bg-white p-1 shadow-lg">
                            <button onClick={() => openEdit(d)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low"><Pencil size={14} /> Edit</button>
                            <button onClick={() => { setMenuId(null); setConfirm(d); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-body-sm text-body-sm text-error hover:bg-error-container"><Trash2 size={14} /> Delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {d.description && <p className="mt-3 line-clamp-2 font-body-sm text-body-sm text-secondary">{d.description}</p>}

                  <div className="mt-4 flex items-center justify-between border-t border-[#F1F0EA] pt-4">
                    <div className="flex items-center gap-2">
                      <Users size={15} className="text-secondary" />
                      <span className="font-body-sm text-body-sm text-charcoal-heading">{d._count.employees} employee{d._count.employees === 1 ? '' : 's'}</span>
                    </div>
                    {d.manager ? (
                      <div className="flex items-center gap-2" title="Manager">
                        <span style={{ background: tintFor(d.manager.firstName).bg, color: tintFor(d.manager.firstName).fg }} className="grid h-6 w-6 place-items-center rounded-full font-label-sm text-label-sm font-bold">{initials(`${d.manager.firstName} ${d.manager.lastName}`)}</span>
                        <span className="font-body-sm text-body-sm text-secondary">{d.manager.firstName} {d.manager.lastName}</span>
                      </div>
                    ) : <span className="font-body-sm text-body-sm text-secondary">No manager</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <DeptModal dept={editing} onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); refetch(); notify.success(editing ? 'Department updated' : 'Department created'); }}
          onError={(m) => notify.error(m)} />
      )}

      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => setConfirm(null)}>
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Delete “{confirm.name}”?</h3>
            {confirm._count.employees > 0 ? (
              <p className="mt-2 font-body-sm text-body-sm text-error">Cannot delete — reassign {confirm._count.employees} employee{confirm._count.employees === 1 ? '' : 's'} first.</p>
            ) : (
              <p className="mt-2 font-body-sm text-body-sm text-secondary">This department is empty and will be permanently deleted.</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button style={{ background: '#DC2626', boxShadow: '0 4px 12px rgba(220,38,38,0.2)', opacity: confirm._count.employees > 0 ? 0.5 : 1 }}
                disabled={confirm._count.employees > 0 || del.isPending} onClick={() => del.mutate(confirm.id)}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      
    </div>
  );
}

function DeptModal({ dept, onClose, onSaved, onError }: { dept: Dept | null; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState(dept?.name ?? '');
  const [description, setDescription] = useState(dept?.description ?? '');
  const [managerId, setManagerId] = useState(dept?.managerId ?? '');

  const { data: users } = useQuery({
    queryKey: ['users-lite'],
    queryFn: () => api.get<UserLite[] | Paginated<UserLite>>('/users').then((r) => (Array.isArray(r.data) ? r.data : r.data.data)),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || undefined, managerId: managerId || null };
      return dept ? api.put(`/departments/update/${dept.id}`, body) : api.post('/departments', body);
    },
    onSuccess: onSaved,
    onError: (e: any) => onError(e?.response?.data?.message ?? 'Save failed'),
  });
  const canSave = !!name.trim() && !save.isPending;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-[480px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">{dept ? 'Edit Department' : 'New Department'}</h3>
          <IconAction icon={<X size={16} />} tone="strong" className="hover:bg-surface-container-low text-secondary" onClick={onClose} />
        </div>
        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="dept-name" required>
            <input id="dept-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Laboratory" className={inputCls} />
          </Field>
          <Field label="Description" htmlFor="dept-description">
            <textarea id="dept-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What this team does…" className={`${inputCls} h-auto py-2.5`} />
          </Field>
          <Field label="Manager" htmlFor="dept-manager">
            <select id="dept-manager" value={managerId} onChange={(e) => setManagerId(e.target.value)} className={inputCls}>
              <option value="">No manager</option>
              {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={!canSave} style={{ opacity: canSave ? 1 : 0.5 }} onClick={() => save.mutate()}>
            {dept ? 'Save Changes' : 'Create Department'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'h-11 w-full rounded-xl border border-outline-variant/40 bg-white px-3.5 font-body-sm text-body-sm text-on-surface outline-none transition-colors focus:border-primary';
