'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: { id: string; name: string }[];
  createdAt: string;
}
interface RoleOption { id: string; name: string }

const BADGE = 'inline-flex items-center rounded-full px-3 py-1 font-label-sm text-label-sm';
const CHIP = 'inline-flex items-center rounded-md bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-secondary';
const TH = 'px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider whitespace-nowrap';
const CELL = 'px-4 py-3 font-body-sm text-body-sm text-on-surface align-middle';

export default function UsersPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const { data, isFetching } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserRow[]>('/users').then((r) => r.data),
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    if (!q.trim()) return list;
    const s = q.trim().toLowerCase();
    return list.filter((u) => `${u.email} ${u.firstName} ${u.lastName}`.toLowerCase().includes(s));
  }, [data, q]);

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-charcoal-heading">Users</h2>
          <p className="font-body-sm text-body-sm text-secondary">Manage staff accounts and role assignments.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-[260px] items-center gap-2 rounded-xl border border-outline-variant/40 bg-white px-3 text-secondary">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users"
              className="w-full border-none bg-transparent font-body-sm text-body-sm text-on-surface outline-none placeholder:text-outline" />
          </div>
          {can('user:create') && <Button onClick={() => setModalOpen(true)}><Plus size={16} /> New User</Button>}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className={TH}>Email</th>
                <th className={TH}>Name</th>
                <th className={TH}>Roles</th>
                <th className={TH}>Active</th>
                <th className={TH}>Created</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && rows.length === 0 && (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-outline-variant/10">
                    <td colSpan={5} className="px-4 py-3"><div className="h-5 w-full animate-pulse rounded-md bg-surface-container" /></td>
                  </tr>
                ))
              )}
              {!isFetching && rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center font-body-sm text-body-sm text-secondary">No users found.</td></tr>
              )}
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-outline-variant/10 transition-colors hover:bg-surface-container-low/60">
                  <td className={`${CELL} font-medium`}>{u.email}</td>
                  <td className={CELL}>{u.firstName} {u.lastName}</td>
                  <td className={CELL}>
                    {u.roles?.length
                      ? <div className="flex flex-wrap gap-1">{u.roles.map((role) => <span key={role.id} className={CHIP}>{role.name}</span>)}</div>
                      : '—'}
                  </td>
                  <td className={CELL}>
                    {u.isActive
                      ? <span className={`${BADGE} bg-status-sage/10 text-status-sage`}>Active</span>
                      : <span className={`${BADGE} bg-error-container text-error`}>Disabled</span>}
                  </td>
                  <td className={`${CELL} whitespace-nowrap`}>{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <NewUserModal
          onClose={() => setModalOpen(false)}
          onCreated={() => { setModalOpen(false); qc.invalidateQueries({ queryKey: ['users'] }); notify('ok', 'User created'); }}
          notify={notify}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 font-label-md text-label-md text-white shadow-lg"
          style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function NewUserModal({ onClose, onCreated, notify }: { onClose: () => void; onCreated: () => void; notify: (type: 'ok' | 'err', msg: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);

  const { data: roles = [] } = useQuery({
    queryKey: ['roles-options'],
    queryFn: () => api.get<RoleOption[]>('/roles').then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: () => api.post('/users', { email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim(), roleIds }),
    onSuccess: onCreated,
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not create user'),
  });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSave = emailValid && password.length >= 8 && !!firstName.trim() && !!lastName.trim() && !create.isPending;
  const label = 'mb-1.5 block font-label-md text-label-md text-on-surface';
  const input = 'h-11 w-full rounded-xl border border-outline-variant/40 bg-white px-3.5 font-body-sm text-body-sm text-on-surface outline-none transition-colors focus:border-primary';
  const toggleRole = (id: string) => setRoleIds((prev) => prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">New User</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low"><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className={label}>Email</label>
            <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@lab.com" />
          </div>
          <div>
            <label className={label}>Password</label>
            <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>First name</label>
              <input className={input} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <label className={label}>Last name</label>
              <input className={input} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={label}>Roles</label>
            <div className="flex flex-wrap gap-2">
              {roles.length === 0 && <span className="font-body-sm text-body-sm text-secondary">No roles available.</span>}
              {roles.map((r) => {
                const on = roleIds.includes(r.id);
                return (
                  <button key={r.id} type="button" onClick={() => toggleRole(r.id)}
                    className={`${BADGE} border transition-colors ${on ? 'bg-primary-fixed text-primary border-primary/30' : 'bg-white text-secondary border-outline-variant/40'}`}>
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSave} style={{ opacity: canSave ? 1 : 0.5 }} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create User'}
          </Button>
        </div>
      </div>
    </div>
  );
}
