'use client';

import { useCallback, useMemo, useState } from 'react';
import { Award, Check, Plus, Target, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FeatureGate } from '@/components/FeatureGate';
import { useEmployees, useMyEmployee, empName, fmtDate } from '@/lib/workforce';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { Card, Button, Th, Td, IconAction, TableEmpty } from '@/components/ui';
import { notify } from '@/lib/notify';

// Stable empty fallback so the infinite-scroll fetchFn identity is stable while loading.
const NO_ROWS: any[] = [];


// Score colour: ≥80 green, 60-79 detector-safe yellow, <60 red (no orange).
const scoreColor = (v: number) => (v >= 80 ? '#16A34A' : v >= 60 ? '#A16207' : '#DC2626');

const REVIEW_STATUS: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: '#F1F5F9', fg: '#475569' }, SUBMITTED: { bg: '#EEF2FF', fg: '#4F46E5' }, ACKNOWLEDGED: { bg: '#DCFCE7', fg: '#16A34A' },
};
const GOAL_STATUS: Record<string, { bg: string; fg: string }> = {
  ACTIVE: { bg: '#EEF2FF', fg: '#4F46E5' }, COMPLETED: { bg: '#DCFCE7', fg: '#16A34A' }, MISSED: { bg: '#FEE2E2', fg: '#DC2626' },
};
const Badge = ({ status, map }: { status: string; map: Record<string, { bg: string; fg: string }> }) => {
  const s = map[status] ?? Object.values(map)[0];
  return <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: s.bg, color: s.fg }}>{status}</span>;
};
const Bar = ({ label, value }: { label: string; value: number }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-xs"><span className="text-slate-500">{label}</span><span className="font-semibold" style={{ color: scoreColor(value) }}>{value}</span></div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: scoreColor(value) }} /></div>
  </div>
);

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-sm font-medium text-slate-600">{label} <span className="font-bold text-primary">{value}</span></label>
      <input type="range" min="0" max="100" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </div>
  );
}

// ── New Review modal ───────────────────────────────────────────────────────────
function NewReviewModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: employees = [] } = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [period, setPeriod] = useState('');
  const [scores, setScores] = useState({ overallScore: 70, attendanceScore: 70, productivityScore: 70, qualityScore: 70 });
  const [comments, setComments] = useState('');
  const [err, setErr] = useState('');
  const create = useMutation({
    mutationFn: () => api.post('/workforce/performance/reviews', { employeeId, period, ...scores, comments: comments || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['perf-reviews'] }); onClose(); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed to create review'),
  });
  const set = (k: keyof typeof scores) => (v: number) => setScores((p) => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-charcoal-heading">New Performance Review</h3><IconAction icon={<X size={18} />} onClick={onClose} /></div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Employee</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary">
          <option value="">Select employee…</option>{employees.map((e) => <option key={e.id} value={e.id}>{empName(e)}</option>)}
        </select>
        <label className="mb-1 block text-sm font-medium text-slate-600">Period</label>
        <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. Q2 2026" className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" />
        <div className="mb-4 flex flex-col gap-4">
          <Slider label="Overall" value={scores.overallScore} onChange={set('overallScore')} />
          <Slider label="Attendance" value={scores.attendanceScore} onChange={set('attendanceScore')} />
          <Slider label="Productivity" value={scores.productivityScore} onChange={set('productivityScore')} />
          <Slider label="Quality" value={scores.qualityScore} onChange={set('qualityScore')} />
        </div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Comments</label>
        <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} className="mb-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-primary" />
        {err && <div className="mb-2 text-sm text-error">{err}</div>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} onClick={() => { setErr(''); create.mutate(); }} disabled={!employeeId || !period.trim() || create.isPending}  style={{ opacity: !employeeId || !period.trim() || create.isPending ? 0.5 : 1 }}>Save Draft</Button></div>
      </div>
    </div>
  );
}

// ── Review detail slide-over ───────────────────────────────────────────────────
function ReviewDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { employee: me } = useMyEmployee();
  const { data: r } = useQuery({ queryKey: ['perf-review', id], queryFn: () => api.get(`/workforce/performance/reviews/${id}`).then((res) => res.data) });
  const { data: composite } = useQuery({ queryKey: ['perf-score', r?.employeeId], queryFn: () => api.get(`/workforce/performance/score/${r.employeeId}`).then((res) => res.data), enabled: !!r?.employeeId });
  const { can } = useAuth();
  const isManager = can('employee:change');

  const act = useMutation({
    mutationFn: (action: 'submit' | 'acknowledge') => api.patch(`/workforce/performance/reviews/${id}/${action}`),
    onSuccess: (_d, action) => {
      notify.success(action === 'submit' ? 'Review submitted' : 'Review acknowledged'); qc.invalidateQueries({ queryKey: ['perf-reviews'] }); qc.invalidateQueries({ queryKey: ['perf-review', id] }); qc.invalidateQueries({ queryKey: ['wf-notif-unread'] }); },
  });
  const isMine = !!me && r?.employeeId === me.id;

  return (
    <div className="fixed inset-0 z-[130] flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-lg font-bold text-charcoal-heading">{r ? empName(r.employee) : 'Review'}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">{r && <Badge status={r.status} map={REVIEW_STATUS} />}<span>{r?.period}</span></div>
          </div>
          <IconAction icon={<X size={18} />} onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {r && (
            <>
              <div className="mb-6 flex items-center gap-4 rounded-xl bg-slate-50 p-4">
                <div className="text-4xl font-bold" style={{ color: scoreColor(r.overallScore) }}>{r.overallScore}</div>
                <div className="text-sm text-slate-500">Overall score<br /><span className="text-xs">Reviewer: {r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : '—'}</span></div>
              </div>
              <div className="mb-6 flex flex-col gap-3">
                <Bar label="Attendance" value={r.attendanceScore} />
                <Bar label="Productivity" value={r.productivityScore} />
                <Bar label="Quality" value={r.qualityScore} />
              </div>
              <div className="mb-6">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Comments</div>
                <div className="text-sm text-on-surface">{r.comments || <span className="text-slate-500">No comments.</span>}</div>
              </div>

              {composite && (
                <Card radius="sm" elevation="sm" border="subtle" className="mb-6 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-charcoal-heading">Composite Score</span>
                    <span className="text-2xl font-bold" style={{ color: scoreColor(composite.score) }}>{composite.score}</span>
                  </div>
                  <div className="flex flex-col gap-2 text-xs">
                    {([['Attendance', composite.breakdown.attendance, '25%'], ['Productivity', composite.breakdown.productivity, '35%'], ['Quality', composite.breakdown.quality, '25%'], ['Review', composite.breakdown.review, '15%']] as const).map(([label, b, w]) => (
                      <div key={label} className="flex items-center justify-between"><span className="text-slate-500">{label} <span className="text-slate-300">· {w}</span></span><span className="font-semibold text-charcoal-heading">{b.score}</span></div>
                    ))}
                  </div>
                </Card>
              )}

              <div className="flex gap-2">
                {isManager && r.status === 'DRAFT' && <Button onClick={() => act.mutate('submit')} disabled={act.isPending} className="flex-1 justify-center">Submit to Employee</Button>}
                {isMine && r.status === 'SUBMITTED' && <Button onClick={() => act.mutate('acknowledge')} disabled={act.isPending} className="flex-1 justify-center"><Check size={16} /> Acknowledge</Button>}
                {r.status === 'ACKNOWLEDGED' && <div className="flex-1 rounded-xl bg-green-50 px-4 py-2.5 text-center text-sm font-semibold text-green-700">Acknowledged</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewsTab() {
  const { can } = useAuth();
  const isManager = can('employee:change');
  const { data: employees = [] } = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [period, setPeriod] = useState('');
  const [status, setStatus] = useState('ALL');
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const params = useMemo(() => ({ ...(employeeId ? { employeeId } : {}), ...(period ? { period } : {}), ...(status !== 'ALL' ? { status } : {}) }), [employeeId, period, status]);
  const { data: reviewsData } = useQuery({ queryKey: ['perf-reviews', params], queryFn: () => api.get('/workforce/performance/reviews', { params }).then((r) => r.data) });
  const reviews = (reviewsData ?? NO_ROWS) as any[];
  const fetchFn = useCallback((p: number, ps: number) => Promise.resolve(clientPage(reviews, p, ps)), [reviews]);
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<any>({ fetchFn, pageSize: 20 });

  return (
    <div>
      <Card radius="sm" elevation="sm" border="subtle" className="mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary">
            <option value="">All Employees</option>{employees.map((e) => <option key={e.id} value={e.id}>{empName(e)}</option>)}
          </select>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Period (e.g. Q2 2026)" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary">
            {['ALL', 'DRAFT', 'SUBMITTED', 'ACKNOWLEDGED'].map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s}</option>)}
          </select>
        </div>
        {isManager && <Button onClick={() => setNewOpen(true)}><Plus size={16} /> New Review</Button>}
      </Card>

      <Card radius="sm" elevation="sm" border="subtle" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><Th density="compact" size="xs">Employee</Th><Th density="compact" size="xs">Period</Th><Th density="compact" size="xs" className="text-right">Overall</Th><Th density="compact" size="xs" className="text-right">Attend.</Th><Th density="compact" size="xs" className="text-right">Prod.</Th><Th density="compact" size="xs" className="text-right">Quality</Th><Th density="compact" size="xs">Status</Th><Th density="compact" size="xs">Reviewer</Th></tr></thead>
            <tbody>
              {!initialLoading && reviews.length === 0 && <TableEmpty colSpan={8}>No reviews match these filters.</TableEmpty>}
              {pageRows.map((r: any) => (
                <tr key={r.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setDetailId(r.id)}>
                  <Td density="compact" tone="inherit" className="text-sm font-medium text-charcoal-heading">{empName(r.employee)}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-slate-600">{r.period}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right font-bold" style={{ color: scoreColor(r.overallScore) }}>{r.overallScore}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right text-slate-600">{r.attendanceScore}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right text-slate-600">{r.productivityScore}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right text-slate-600">{r.qualityScore}</Td>
                  <Td density="compact" tone="inherit" className="text-sm"><Badge status={r.status} map={REVIEW_STATUS} /></Td>
                  <Td density="compact" tone="inherit" className="text-sm text-slate-500">{r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageRows.length > 0 && <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />}
      </Card>

      {newOpen && <NewReviewModal onClose={() => setNewOpen(false)} />}
      {detailId && <ReviewDrawer id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// ── Goals ──────────────────────────────────────────────────────────────────────
function NewGoalModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: employees = [] } = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [err, setErr] = useState('');
  const create = useMutation({
    mutationFn: () => api.post('/workforce/performance/goals', { employeeId, title, description: description || undefined, targetDate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['perf-goals'] }); onClose(); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed to create goal'),
  });
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-charcoal-heading">New Goal</h3><IconAction icon={<X size={18} />} onClick={onClose} /></div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Employee</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary">
          <option value="">Select employee…</option>{employees.map((e) => <option key={e.id} value={e.id}>{empName(e)}</option>)}
        </select>
        <label className="mb-1 block text-sm font-medium text-slate-600">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" />
        <label className="mb-1 block text-sm font-medium text-slate-600">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mb-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-primary" />
        <label className="mb-1 block text-sm font-medium text-slate-600">Target date</label>
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" />
        {err && <div className="mb-2 text-sm text-error">{err}</div>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} onClick={() => { setErr(''); create.mutate(); }} disabled={!employeeId || !title.trim() || !targetDate || create.isPending}  style={{ opacity: !employeeId || !title.trim() || !targetDate || create.isPending ? 0.5 : 1 }}>Create Goal</Button></div>
      </div>
    </div>
  );
}

function GoalEditor({ goal, onClose }: { goal: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState(goal.progress);
  const [status, setStatus] = useState(goal.status);
  const save = useMutation({
    mutationFn: () => api.patch(`/workforce/performance/goals/${goal.id}`, { progress, status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['perf-goals'] }); onClose(); },
  });
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-charcoal-heading">{goal.title}</h3><IconAction icon={<X size={18} />} onClick={onClose} /></div>
        <label className="mb-1 flex items-center justify-between text-sm font-medium text-slate-600">Progress <span className="font-bold text-primary">{progress}%</span></label>
        <input type="range" min="0" max="100" value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="mb-4 w-full accent-primary" />
        <label className="mb-1 block text-sm font-medium text-slate-600">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="mb-5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary">
          {['ACTIVE', 'COMPLETED', 'MISSED'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()} disabled={save.isPending}>Save</Button></div>
      </div>
    </div>
  );
}

function GoalsTab() {
  const { data: employees = [] } = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('ALL');
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const params = useMemo(() => ({ ...(employeeId ? { employeeId } : {}), ...(status !== 'ALL' ? { status } : {}) }), [employeeId, status]);
  const { data: goalsData } = useQuery({ queryKey: ['perf-goals', params], queryFn: () => api.get('/workforce/performance/goals', { params }).then((r) => r.data) });
  const goals = (goalsData ?? NO_ROWS) as any[];
  const fetchFn = useCallback((p: number, ps: number) => Promise.resolve(clientPage(goals, p, ps)), [goals]);
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<any>({ fetchFn, pageSize: 20 });

  return (
    <div>
      <Card radius="sm" elevation="sm" border="subtle" className="mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary">
            <option value="">All Employees</option>{employees.map((e) => <option key={e.id} value={e.id}>{empName(e)}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary">
            {['ALL', 'ACTIVE', 'COMPLETED', 'MISSED'].map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s}</option>)}
          </select>
        </div>
        <Button onClick={() => setNewOpen(true)}><Plus size={16} /> New Goal</Button>
      </Card>

      <Card radius="sm" elevation="sm" border="subtle" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><Th density="compact" size="xs">Employee</Th><Th density="compact" size="xs">Title</Th><Th density="compact" size="xs">Target Date</Th><Th density="compact" size="xs">Progress</Th><Th density="compact" size="xs">Status</Th></tr></thead>
            <tbody>
              {!initialLoading && goals.length === 0 && <TableEmpty colSpan={5}>No goals match these filters.</TableEmpty>}
              {pageRows.map((g: any) => (
                <tr key={g.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setEditing(g)}>
                  <Td density="compact" tone="inherit" className="text-sm text-slate-600">{empName(g.employee)}</Td>
                  <Td density="compact" tone="inherit" className="text-sm font-medium text-charcoal-heading">{g.title}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-slate-600">{fmtDate(g.targetDate)}</Td>
                  <Td density="compact" tone="inherit" className="text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${g.progress}%` }} /></div>
                      <span className="text-xs text-slate-500">{g.progress}%</span>
                    </div>
                  </Td>
                  <Td density="compact" tone="inherit" className="text-sm"><Badge status={g.status} map={GOAL_STATUS} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageRows.length > 0 && <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />}
      </Card>

      {newOpen && <NewGoalModal onClose={() => setNewOpen(false)} />}
      {editing && <GoalEditor goal={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PerformancePage() {
  const [tab, setTab] = useState<'reviews' | 'goals'>('reviews');
  return (
    <div className="w-full">
      <div className="mb-5">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Performance Management</h1>
        <p className="mt-1 text-sm text-secondary">Reviews, composite scoring and goals.</p>
      </div>
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        <button onClick={() => setTab('reviews')} className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${tab === 'reviews' ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-on-surface'}`}><Award size={15} /> Reviews</button>
        <button onClick={() => setTab('goals')} className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${tab === 'goals' ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-on-surface'}`}><Target size={15} /> Goals</button>
      </div>
      {tab === 'reviews' ? <ReviewsTab /> : <GoalsTab />}
    </div>
  );
}

export default function Page() {
  return (
    <FeatureGate feature="WORKFORCE_MANAGEMENT" fallback={<div className="p-8 text-sm text-secondary">Workforce Management is not enabled for this lab.</div>}>
      <PerformancePage />
    </FeatureGate>
  );
}
