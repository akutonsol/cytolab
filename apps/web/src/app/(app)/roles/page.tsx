'use client';

import { useState } from 'react';
import { AlertCircle, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { RoleFormDrawer, type RoleRecord } from '@/components/RoleFormDrawer';
import { Button } from '@/components/ui';

const BADGE = 'inline-flex items-center rounded-full px-3 py-1 font-label-sm text-label-sm';
const TH = 'px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider whitespace-nowrap';
const CELL = 'px-4 py-3 font-body-sm text-body-sm text-on-surface align-middle';

export default function RolesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRecord | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<RoleRecord[]>('/roles').then((r) => r.data),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => { notify('ok', 'Role deleted'); setConfirmId(null); qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Delete failed'),
  });

  const rows = (data ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  const errorMessage =
    (error as any)?.code === 'ECONNABORTED'
      ? 'The request timed out. Please try again.'
      : (error as any)?.response?.data?.message ?? 'Could not load roles. Please try again.';

  const openCreate = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = (r: RoleRecord) => { setEditing(r); setDrawerOpen(true); };
  const hasActions = can('permission:change') || can('permission:delete');
  const colCount = 5 + (hasActions ? 1 : 0);

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-charcoal-heading">Roles &amp; Permissions</h2>
          <p className="font-body-sm text-body-sm text-secondary">Define access levels and permission sets.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-[240px] items-center gap-2 rounded-xl border border-outline-variant/40 bg-white px-3 text-secondary">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roles"
              className="w-full border-none bg-transparent font-body-sm text-body-sm text-on-surface outline-none placeholder:text-outline" />
          </div>
          {can('permission:create') && <Button onClick={openCreate}><Plus size={16} /> New Role</Button>}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6">
        {isError && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-error/20 bg-error-container p-4">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-error" />
            <div className="flex-1">
              <div className="font-label-md text-label-md text-error">Failed to load</div>
              <div className="font-body-sm text-body-sm text-on-error-container">{errorMessage}</div>
              <Button variant="secondary" className="mt-3" onClick={() => refetch()}><RotateCcw size={14} /> Retry</Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className={TH}>Name</th>
                <th className={TH}>Description</th>
                <th className={TH}>Scope</th>
                <th className={TH}>Super role</th>
                <th className={TH}>Permissions</th>
                {hasActions && <th className={TH}></th>}
              </tr>
            </thead>
            <tbody>
              {isFetching && !isError && rows.length === 0 && (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-outline-variant/10">
                    <td colSpan={colCount} className="px-4 py-3"><div className="h-5 w-full animate-pulse rounded-md bg-surface-container" /></td>
                  </tr>
                ))
              )}
              {!isFetching && rows.length === 0 && !isError && (
                <tr><td colSpan={colCount} className="px-4 py-10 text-center font-body-sm text-body-sm text-secondary">No roles found.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-outline-variant/10 transition-colors hover:bg-surface-container-low/60">
                  <td className={`${CELL} font-medium`}>{r.name}</td>
                  <td className={CELL}>{r.description ?? '—'}</td>
                  <td className={CELL}><span className={`${BADGE} bg-surface-container text-secondary`}>{r.scope}</span></td>
                  <td className={CELL}>
                    {r.isSuperRole
                      ? <span className={`${BADGE} bg-primary-fixed text-primary`}>Yes</span>
                      : <span className={`${BADGE} bg-surface-container text-secondary`}>No</span>}
                  </td>
                  <td className={CELL}>{r.isSuperRole ? 'All (bypass)' : r.permissions?.length ?? 0}</td>
                  {hasActions && (
                    <td className={CELL}>
                      {confirmId === r.id ? (
                        <div className="flex items-center gap-2">
                          <span className="font-body-sm text-body-sm text-secondary">Delete?</span>
                          <Button onClick={() => del.mutate(r.id)} disabled={del.isPending}  style={{ background: '#DC2626', boxShadow: '0 4px 12px rgba(220,38,38,0.2)' }}>Delete</Button>
                          <Button variant="secondary" onClick={() => setConfirmId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {can('permission:change') && <Button variant="secondary" onClick={() => openEdit(r)}><Pencil size={14} /> Edit</Button>}
                          {can('permission:delete') && (
                            <button onClick={() => setConfirmId(r.id)} className="grid h-9 w-9 place-items-center rounded-xl border border-outline-variant/30 text-secondary transition-colors hover:bg-error-container hover:text-error"><Trash2 size={15} /></button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <RoleFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} role={editing} />

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 font-label-md text-label-md text-white shadow-lg"
          style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
