'use client';

import { useCallback, useMemo, useState } from 'react';
import { CalendarOff, Check, Plus, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FeatureGate } from '@/components/FeatureGate';
import { useMyEmployee, empName, fmtDate, daysBetweenInclusive, WF_STATUS } from '@/lib/workforce';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';

const CARD = 'rounded-xl border border-slate-100 bg-white shadow-sm';
// Stable empty fallback so the infinite-scroll fetchFn identity is stable while loading.
const NO_ROWS: any[] = [];
const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
const CELL = 'px-4 py-3 align-middle text-sm';

function StatusBadge({ status }: { status: string }) {
  const s = WF_STATUS[status] ?? WF_STATUS.PENDING;
  return <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: s.bg, color: s.fg }}>{(s.label ?? status).toUpperCase()}</span>;
}

// ── Request Leave modal ────────────────────────────────────────────────────────
function RequestModal({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: types = [] } = useQuery({ queryKey: ['leave-types'], queryFn: () => api.get('/workforce/leave/types').then((r) => r.data) });
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const totalDays = daysBetweenInclusive(startDate, endDate);

  const submit = useMutation({
    mutationFn: () => api.post('/workforce/leave/request', { employeeId, leaveTypeId, startDate, endDate, reason: reason || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave-requests'] }); qc.invalidateQueries({ queryKey: ['leave-balance'] }); onClose(); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed to submit request'),
  });
  const valid = leaveTypeId && startDate && endDate && totalDays > 0;

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-charcoal-heading">Request Leave</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Leave type</label>
        <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary">
          <option value="">Select type…</option>
          {types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="mb-4 flex gap-3">
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-slate-600">Start date</label><input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-slate-600">End date</label><input type="date" value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
        </div>
        {totalDays > 0 && <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Total: <span className="font-semibold text-charcoal-heading">{totalDays} day{totalDays === 1 ? '' : 's'}</span></div>}
        <label className="mb-1 block text-sm font-medium text-slate-600">Reason <span className="text-slate-500">(optional)</span></label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mb-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-primary" placeholder="Add a note…" />
        {err && <div className="mb-2 text-sm text-error">{err}</div>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={() => submit.mutate()} disabled={!valid || submit.isPending} className="btn-primary" style={{ opacity: !valid || submit.isPending ? 0.5 : 1 }}>{submit.isPending ? 'Submitting…' : 'Submit Request'}</button></div>
      </div>
    </div>
  );
}

// ── My Leave tab ───────────────────────────────────────────────────────────────
function MyLeaveTab() {
  const { employee, isLoading } = useMyEmployee();
  const [reqOpen, setReqOpen] = useState(false);
  const { data: balances = [] } = useQuery({
    queryKey: ['leave-balance', employee?.id],
    queryFn: () => api.get(`/workforce/leave/balance/${employee!.id}`).then((r) => r.data),
    enabled: !!employee?.id,
  });
  const { data: requestsData } = useQuery({
    queryKey: ['leave-requests', employee?.id],
    queryFn: () => api.get('/workforce/leave/requests', { params: { employeeId: employee!.id } }).then((r) => r.data),
    enabled: !!employee?.id,
  });
  const requests = (requestsData ?? NO_ROWS) as any[];
  const fetchFn = useCallback((p: number, ps: number) => Promise.resolve(clientPage(requests, p, ps)), [requests]);
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<any>({ fetchFn, pageSize: 20 });

  if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (!employee) return <div className={`${CARD} p-6 text-sm text-slate-500`}>No employee profile is linked to your account.</div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-base font-semibold text-charcoal-heading">Balances · {new Date().getFullYear()}</h2>
        <button onClick={() => setReqOpen(true)} className="btn-primary"><Plus size={16} /> Request Leave</button>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {balances.length === 0 && <div className={`${CARD} p-5 text-sm text-slate-500`}>No balances initialised for this year.</div>}
        {balances.map((b: any) => {
          const remaining = b.entitlement - b.used - b.pending;
          const usedPct = b.entitlement > 0 ? Math.min(100, Math.round((b.used / b.entitlement) * 100)) : 0;
          const pendPct = b.entitlement > 0 ? Math.min(100 - usedPct, Math.round((b.pending / b.entitlement) * 100)) : 0;
          return (
            <div key={b.id} className={`${CARD} p-5`}>
              <div className="mb-3 flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><CalendarOff size={17} /></span><span className="text-sm font-semibold text-charcoal-heading">{b.leaveType?.name ?? 'Leave'}</span></div>
              <div className="mb-1 flex items-end justify-between"><span className="text-3xl font-bold leading-none text-charcoal-heading">{remaining}</span><span className="text-xs text-slate-500">of {b.entitlement} days</span></div>
              <div className="mb-2 text-[11px] font-medium text-slate-500">remaining</div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-indigo-500" style={{ width: `${usedPct}%` }} />
                <div className="h-full" style={{ width: `${pendPct}%`, background: '#A16207' }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span>Used {b.used}</span><span style={{ color: '#A16207' }}>Pending {b.pending}</span></div>
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 text-base font-semibold text-charcoal-heading">My Requests</h2>
      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><th className={TH}>Type</th><th className={TH}>Start</th><th className={TH}>End</th><th className={`${TH} text-right`}>Days</th><th className={TH}>Status</th></tr></thead>
            <tbody>
              {!initialLoading && requests.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">No leave requests yet.</td></tr>}
              {pageRows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className={`${CELL} font-medium text-charcoal-heading`}>{r.leaveType?.name ?? '—'}</td>
                  <td className={`${CELL} text-slate-600`}>{fmtDate(r.startDate)}</td>
                  <td className={`${CELL} text-slate-600`}>{fmtDate(r.endDate)}</td>
                  <td className={`${CELL} text-right`}>{r.totalDays}</td>
                  <td className={CELL}><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageRows.length > 0 && <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />}
      </div>

      {reqOpen && <RequestModal employeeId={employee.id} onClose={() => setReqOpen(false)} />}
    </div>
  );
}

// ── Manage Leave tab (manager) ─────────────────────────────────────────────────
function ManageLeaveTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('ALL');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const params = useMemo(() => ({
    ...(status !== 'ALL' ? { status } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  }), [status, startDate, endDate]);

  const { data: requestsData } = useQuery({
    queryKey: ['leave-requests', 'manage', params],
    queryFn: () => api.get('/workforce/leave/requests', { params }).then((r) => r.data),
  });
  const requests = (requestsData ?? NO_ROWS) as any[];
  const fetchFn = useCallback((p: number, ps: number) => Promise.resolve(clientPage(requests, p, ps)), [requests]);
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<any>({ fetchFn, pageSize: 20 });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['leave-requests'] }); qc.invalidateQueries({ queryKey: ['wf-notif-unread'] }); };
  const approve = useMutation({ mutationFn: (id: string) => api.patch(`/workforce/leave/requests/${id}/approve`), onSuccess: invalidate });
  const reject = useMutation({
    mutationFn: ({ id, rejectionReason }: { id: string; rejectionReason: string }) => api.patch(`/workforce/leave/requests/${id}/reject`, { rejectionReason }),
    onSuccess: () => { setRejecting(null); setReason(''); invalidate(); },
  });

  return (
    <div>
      <div className={`${CARD} mb-6 flex flex-wrap items-center gap-3 p-4`}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary">
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s}</option>)}
        </select>
        <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary" />
        <span className="text-sm text-slate-500">to</span>
        <input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary" />
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><th className={TH}>Employee</th><th className={TH}>Type</th><th className={TH}>Dates</th><th className={`${TH} text-right`}>Days</th><th className={TH}>Reason</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Actions</th></tr></thead>
            <tbody>
              {!initialLoading && requests.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">No leave requests match these filters.</td></tr>}
              {pageRows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className={`${CELL} font-medium text-charcoal-heading`}>{empName(r.employee)}</td>
                  <td className={`${CELL} text-slate-600`}>{r.leaveType?.name ?? '—'}</td>
                  <td className={`${CELL} text-slate-600`}>{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</td>
                  <td className={`${CELL} text-right`}>{r.totalDays}</td>
                  <td className={`${CELL} max-w-[220px] truncate text-slate-500`} title={r.reason ?? ''}>{r.reason ?? '—'}</td>
                  <td className={CELL}><StatusBadge status={r.status} /></td>
                  <td className={CELL}>
                    {r.status === 'PENDING' ? (
                      rejecting === r.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" className="h-9 w-40 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-primary" />
                          <button onClick={() => reason.trim() && reject.mutate({ id: r.id, rejectionReason: reason.trim() })} disabled={reject.isPending} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">Confirm</button>
                          <button onClick={() => { setRejecting(null); setReason(''); }} className="rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-500 hover:bg-slate-50">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => approve.mutate(r.id)} disabled={approve.isPending} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50"><Check size={14} /> Approve</button>
                          <button onClick={() => { setRejecting(r.id); setReason(''); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"><X size={14} /> Reject</button>
                        </div>
                      )
                    ) : <span className="text-xs text-slate-500">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageRows.length > 0 && <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />}
      </div>
    </div>
  );
}

function LeavePage() {
  const { can } = useAuth();
  const isManager = can('employee:change');
  const [tab, setTab] = useState<'my' | 'manage'>('my');

  return (
    <div className="w-full">
      <div className="mb-5">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Leave Management</h1>
        <p className="mt-1 text-sm text-secondary">Request time off and track your balances.</p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        <button onClick={() => setTab('my')} className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${tab === 'my' ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-on-surface'}`}>My Leave</button>
        {isManager && <button onClick={() => setTab('manage')} className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${tab === 'manage' ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-on-surface'}`}>Manage Leave</button>}
      </div>

      {tab === 'my' ? <MyLeaveTab /> : isManager ? <ManageLeaveTab /> : null}
    </div>
  );
}

export default function Page() {
  return (
    <FeatureGate feature="WORKFORCE_MANAGEMENT" fallback={<div className="p-8 text-sm text-secondary">Workforce Management is not enabled for this lab.</div>}>
      <LeavePage />
    </FeatureGate>
  );
}
