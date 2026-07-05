'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Plus, Settings2, Timer, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FeatureGate } from '@/components/FeatureGate';
import { useEmployees, empName, fmtDate, fmtHours, fmtMultiplier, WF_STATUS } from '@/lib/workforce';

const CARD = 'rounded-xl border border-slate-100 bg-white shadow-sm';
const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap';
const CELL = 'px-4 py-3 align-middle text-sm';

function StatusBadge({ status }: { status: string }) {
  const s = WF_STATUS[status] ?? WF_STATUS.PENDING;
  return <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: s.bg, color: s.fg }}>{(s.label ?? status).toUpperCase()}</span>;
}

// ── Calculate Overtime modal ───────────────────────────────────────────────────
function CalculateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: employees = [] } = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [startDate, setStart] = useState(iso(new Date(Date.now() - 13 * 86_400_000)));
  const [endDate, setEnd] = useState(iso(new Date()));
  const [err, setErr] = useState('');
  const [result, setResult] = useState<any>(null);

  const calc = useMutation({
    mutationFn: () => api.post('/workforce/overtime/calculate', { employeeId, startDate, endDate }).then((r) => r.data),
    onSuccess: (data) => { setResult(data); qc.invalidateQueries({ queryKey: ['overtime-records'] }); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed to calculate'),
  });

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-charcoal-heading">Calculate Overtime</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Employee</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary">
          <option value="">Select employee…</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{empName(e)}</option>)}
        </select>
        <div className="mb-4 flex gap-3">
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-slate-600">Start date</label><input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-slate-600">End date</label><input type="date" value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
        </div>
        {result && <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Created / updated <span className="font-semibold text-charcoal-heading">{result.daysWithOvertime}</span> overtime day(s).</div>}
        {err && <div className="mb-2 text-sm text-error">{err}</div>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="btn-secondary">{result ? 'Close' : 'Cancel'}</button><button onClick={() => { setErr(''); calc.mutate(); }} disabled={!employeeId || calc.isPending} className="btn-primary" style={{ opacity: !employeeId || calc.isPending ? 0.5 : 1 }}>{calc.isPending ? 'Calculating…' : 'Calculate'}</button></div>
      </div>
    </div>
  );
}

// ── Add Rule modal ─────────────────────────────────────────────────────────────
function RuleModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [dailyHours, setDaily] = useState('8');
  const [weeklyHours, setWeekly] = useState('40');
  const [multiplier, setMult] = useState('1.5');
  const [requiresApproval, setReq] = useState(true);
  const [err, setErr] = useState('');

  const create = useMutation({
    mutationFn: () => api.post('/workforce/overtime/rules', {
      name,
      dailyThresholdMinutes: Math.round((parseFloat(dailyHours) || 0) * 60),
      weeklyThresholdMinutes: Math.round((parseFloat(weeklyHours) || 0) * 60),
      rateMultiplierX100: Math.round((parseFloat(multiplier) || 1) * 100),
      requiresApproval,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['overtime-rules'] }); onClose(); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed to create rule'),
  });

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-charcoal-heading">Add Overtime Rule</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard OT" className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" />
        <div className="mb-4 flex gap-3">
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-slate-600">Daily threshold (hrs)</label><input type="number" min="0" step="0.5" value={dailyHours} onChange={(e) => setDaily(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-slate-600">Weekly threshold (hrs)</label><input type="number" min="0" step="0.5" value={weeklyHours} onChange={(e) => setWeekly(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
        </div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Rate multiplier</label>
        <input type="number" min="1" step="0.1" value={multiplier} onChange={(e) => setMult(e.target.value)} className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" placeholder="1.5" />
        <label className="mb-4 flex items-center gap-2.5">
          <input type="checkbox" checked={requiresApproval} onChange={(e) => setReq(e.target.checked)} style={{ accentColor: '#4F46E5', width: 16, height: 16 }} />
          <span className="text-sm text-slate-700">Requires approval</span>
        </label>
        {err && <div className="mb-2 text-sm text-error">{err}</div>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={() => { setErr(''); create.mutate(); }} disabled={!name.trim() || create.isPending} className="btn-primary" style={{ opacity: !name.trim() || create.isPending ? 0.5 : 1 }}>{create.isPending ? 'Saving…' : 'Add Rule'}</button></div>
      </div>
    </div>
  );
}

function OvertimePage() {
  const { can } = useAuth();
  const isManager = can('employee:change');
  const qc = useQueryClient();
  const { data: employees = [] } = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [status, setStatus] = useState('ALL');
  const [calcOpen, setCalcOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [rulesShown, setRulesShown] = useState(false);

  const params = useMemo(() => ({
    ...(employeeId ? { employeeId } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(status !== 'ALL' ? { status } : {}),
  }), [employeeId, startDate, endDate, status]);

  const { data: records = [] } = useQuery({
    queryKey: ['overtime-records', params],
    queryFn: () => api.get('/workforce/overtime/records', { params }).then((r) => r.data),
  });
  const { data: rules = [] } = useQuery({
    queryKey: ['overtime-rules'],
    queryFn: () => api.get('/workforce/overtime/rules').then((r) => r.data),
    enabled: isManager && rulesShown,
  });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['overtime-records'] }); qc.invalidateQueries({ queryKey: ['wf-notif-unread'] }); };
  const approve = useMutation({ mutationFn: (id: string) => api.patch(`/workforce/overtime/records/${id}/approve`), onSuccess: invalidate });
  const reject = useMutation({ mutationFn: (id: string) => api.patch(`/workforce/overtime/records/${id}/reject`), onSuccess: invalidate });

  return (
    <div className="w-full">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Overtime</h1>
          <p className="mt-1 text-sm text-secondary">Overtime records derived from clock events, and the rules that price them.</p>
        </div>
        {isManager && <button onClick={() => setCalcOpen(true)} className="btn-primary"><Timer size={16} /> Calculate Overtime</button>}
      </div>

      {/* Filters */}
      <div className={`${CARD} mb-6 flex flex-wrap items-center gap-3 p-4`}>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary">
          <option value="">All Employees</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{empName(e)}</option>)}
        </select>
        <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary" />
        <span className="text-sm text-slate-400">to</span>
        <input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary">
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s}</option>)}
        </select>
      </div>

      {/* Records */}
      <div className={`${CARD} mb-6 overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><th className={TH}>Employee</th><th className={TH}>Date</th><th className={`${TH} text-right`}>Regular Hrs</th><th className={`${TH} text-right`}>Overtime Hrs</th><th className={`${TH} text-right`}>Rate</th><th className={TH}>Status</th>{isManager && <th className={`${TH} text-right`}>Actions</th>}</tr></thead>
            <tbody>
              {records.length === 0 && <tr><td colSpan={isManager ? 7 : 6} className="px-4 py-12 text-center text-sm text-slate-400">No overtime records. Use “Calculate Overtime” to generate them.</td></tr>}
              {records.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className={`${CELL} font-medium text-charcoal-heading`}>{empName(r.employee)}</td>
                  <td className={`${CELL} text-slate-600`}>{fmtDate(r.date)}</td>
                  <td className={`${CELL} text-right`}>{fmtHours(r.regularMinutes)}</td>
                  <td className={`${CELL} text-right font-semibold text-charcoal-heading`}>{fmtHours(r.overtimeMinutes)}</td>
                  <td className={`${CELL} text-right`}>{fmtMultiplier(r.overtimeRule?.rateMultiplierX100)}</td>
                  <td className={CELL}><StatusBadge status={r.status} /></td>
                  {isManager && (
                    <td className={CELL}>
                      {r.status === 'PENDING' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => approve.mutate(r.id)} disabled={approve.isPending} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-green-600 hover:bg-green-50" title="Approve"><Check size={16} /></button>
                          <button onClick={() => reject.mutate(r.id)} disabled={reject.isPending} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50" title="Reject"><X size={16} /></button>
                        </div>
                      ) : <div className="text-right text-xs text-slate-400">—</div>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rules (manager only, collapsible) */}
      {isManager && (
        <div className={`${CARD} overflow-hidden`}>
          <button onClick={() => setRulesShown((v) => !v)} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50">
            <span className="flex items-center gap-2 text-base font-semibold text-charcoal-heading"><Settings2 size={17} className="text-slate-400" /> Overtime Rules</span>
            {rulesShown ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
          </button>
          {rulesShown && (
            <div className="border-t border-slate-100 p-5">
              <div className="mb-3 flex justify-end"><button onClick={() => setRuleOpen(true)} className="btn-secondary"><Plus size={15} /> Add Rule</button></div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-slate-100"><th className={TH}>Name</th><th className={`${TH} text-right`}>Daily</th><th className={`${TH} text-right`}>Weekly</th><th className={`${TH} text-right`}>Rate</th><th className={TH}>Approval</th><th className={TH}>Active</th></tr></thead>
                  <tbody>
                    {rules.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No rules yet.</td></tr>}
                    {rules.map((rule: any) => (
                      <tr key={rule.id} className="border-b border-slate-100">
                        <td className={`${CELL} font-medium text-charcoal-heading`}>{rule.name}</td>
                        <td className={`${CELL} text-right text-slate-600`}>{fmtHours(rule.dailyThresholdMinutes)}h</td>
                        <td className={`${CELL} text-right text-slate-600`}>{fmtHours(rule.weeklyThresholdMinutes)}h</td>
                        <td className={`${CELL} text-right`}>{fmtMultiplier(rule.rateMultiplierX100)}</td>
                        <td className={`${CELL} text-slate-600`}>{rule.requiresApproval ? 'Required' : 'Auto'}</td>
                        <td className={CELL}>{rule.isActive ? <span className="text-green-600">Active</span> : <span className="text-slate-400">Inactive</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {calcOpen && <CalculateModal onClose={() => setCalcOpen(false)} />}
      {ruleOpen && <RuleModal onClose={() => setRuleOpen(false)} />}
    </div>
  );
}

export default function Page() {
  return (
    <FeatureGate feature="WORKFORCE_MANAGEMENT" fallback={<div className="p-8 text-sm text-secondary">Workforce Management is not enabled for this lab.</div>}>
      <OvertimePage />
    </FeatureGate>
  );
}
