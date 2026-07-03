'use client';

import { useState } from 'react';
import { AlertCircle, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ClientFormDrawer, type ClientRecord } from '@/components/ClientFormDrawer';

const BADGE = 'inline-flex items-center rounded-full px-3 py-1 font-label-sm text-label-sm';
const TH = 'px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider whitespace-nowrap';
const CELL = 'px-4 py-3 font-body-sm text-body-sm text-on-surface align-middle';

export default function ClientsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRecord | null>(null);

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['clients', page, pageSize, q],
    queryFn: () =>
      api
        .get<Paginated<ClientRecord>>('/clients', { params: { page, pageSize, q: q || undefined } })
        .then((r) => r.data),
  });

  const errorMessage =
    (error as any)?.code === 'ECONNABORTED'
      ? 'The request timed out. Please try again.'
      : (error as any)?.response?.data?.message ?? 'Could not load clients. Please try again.';

  const openCreate = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = (c: ClientRecord) => { setEditing(c); setDrawerOpen(true); };
  const runSearch = () => { setQ(term.trim()); setPage(1); };

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasEdit = can('client:change');
  const colCount = hasEdit ? 7 : 6;

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-charcoal-heading">Clients</h2>
          <p className="font-body-sm text-body-sm text-secondary">Manage referring clients and portal access.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-[280px] items-center gap-2 rounded-xl border border-outline-variant/40 bg-white px-3 text-secondary">
            <Search size={16} />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder="Search name, office, email, phone"
              className="w-full border-none bg-transparent font-body-sm text-body-sm text-on-surface outline-none placeholder:text-outline"
            />
          </div>
          {can('client:create') && (
            <button className="btn-primary" onClick={openCreate}><Plus size={16} /> New Client</button>
          )}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6">
        {isError && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-error/20 bg-error-container p-4">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-error" />
            <div className="flex-1">
              <div className="font-label-md text-label-md text-error">Failed to load</div>
              <div className="font-body-sm text-body-sm text-on-error-container">{errorMessage}</div>
              <button className="btn-secondary mt-3" onClick={() => refetch()}><RotateCcw size={14} /> Retry</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className={TH}>Name</th>
                <th className={TH}>Office</th>
                <th className={TH}>Type</th>
                <th className={TH}>Phone</th>
                <th className={TH}>Email</th>
                <th className={TH}>Status</th>
                {hasEdit && <th className={TH}></th>}
              </tr>
            </thead>
            <tbody>
              {isFetching && !isError && rows.length === 0 && (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-outline-variant/10">
                    <td colSpan={colCount} className="px-4 py-3"><div className="h-5 w-full animate-pulse rounded-md bg-surface-container" /></td>
                  </tr>
                ))
              )}
              {!isFetching && rows.length === 0 && !isError && (
                <tr><td colSpan={colCount} className="px-4 py-10 text-center font-body-sm text-body-sm text-secondary">No clients found.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-outline-variant/10 transition-colors hover:bg-surface-container-low/60">
                  <td className={`${CELL} font-medium`}>{r.firstName} {r.lastName}</td>
                  <td className={CELL}>{r.officeName || '—'}</td>
                  <td className={CELL}>{r.clientType ? r.clientType.type : '—'}</td>
                  <td className={CELL}>{r.phoneNumber || '—'}</td>
                  <td className={CELL}>{r.email || '—'}</td>
                  <td className={CELL}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.blocked
                        ? <span className={`${BADGE} bg-error-container text-error`}>Blocked</span>
                        : r.active
                          ? <span className={`${BADGE} bg-status-sage/10 text-status-sage`}>Active</span>
                          : <span className={`${BADGE} bg-surface-container text-secondary`}>Inactive</span>}
                      {r.portalUsers && r.portalUsers.length > 0 && <span className={`${BADGE} bg-primary-fixed text-primary`}>Portal</span>}
                    </div>
                  </td>
                  {hasEdit && (
                    <td className={CELL}>
                      <button onClick={() => openEdit(r)} className="btn-secondary"><Pencil size={14} /> Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="font-body-sm text-body-sm text-secondary">{total} total</div>
          <div className="flex items-center gap-3">
            <select
              className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              {[10, 20, 50, 100].map((s) => <option key={s} value={s}>{s} / page</option>)}
            </select>
            <div className="flex items-center gap-2">
              <button className="btn-secondary" disabled={page <= 1} style={{ opacity: page <= 1 ? 0.5 : 1 }} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
              <span className="font-body-sm text-body-sm text-secondary">Page {page} / {totalPages}</span>
              <button className="btn-secondary" disabled={page >= totalPages} style={{ opacity: page >= totalPages ? 0.5 : 1 }} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
        </div>
      </div>

      <ClientFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} client={editing} />
    </div>
  );
}
