'use client';

import { useCallback, useMemo, useState } from 'react';
import { BarChart3, CalendarOff, Download, FileClock, Timer } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FeatureGate } from '@/components/FeatureGate';
import { useEmployees, fmtHours, fmtMoney, fmtMultiplier, rateColor, WARN_FG } from '@/lib/workforce';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';

const CARD = 'rounded-xl border border-slate-100 bg-white shadow-sm';
// Stable empty fallback so the infinite-scroll fetchFn identity is stable while loading.
const NO_ROWS: any[] = [];
const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap';
const CELL = 'px-4 py-3 align-middle text-sm';
const iso = (d: Date) => d.toISOString().slice(0, 10);

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function DateRange({ start, end, onStart, onEnd }: { start: string; end: string; onStart: (v: string) => void; onEnd: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input type="date" value={start} onChange={(e) => onStart(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary" />
      <span className="text-sm text-slate-400">to</span>
      <input type="date" value={end} onChange={(e) => onEnd(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary" />
    </div>
  );
}

// 1. Attendance Summary ─────────────────────────────────────────────────────────
function AttendanceTab() {
  const [start, setStart] = useState(iso(new Date(Date.now() - 29 * 86_400_000)));
  const [end, setEnd] = useState(iso(new Date()));
  const [departmentId, setDept] = useState('');
  const { data: employees = [] } = useEmployees();
  const departments = useMemo(() => Array.from(new Map(employees.filter((e) => e.department).map((e) => [e.department!.id, e.department!.name])).entries()), [employees]);

  const params = { startDate: start, endDate: end, ...(departmentId ? { departmentId } : {}) };
  const { data: rowsData } = useQuery({
    queryKey: ['rpt-attendance', params],
    queryFn: () => api.get('/workforce/reports/attendance-summary', { params }).then((r) => r.data),
    enabled: !!start && !!end,
  });
  const rows = (rowsData ?? NO_ROWS) as any[];
  // Infinite scroll over the attendance summary rows (export still uses the full set).
  const fetchFn = useCallback((p: number, ps: number) => Promise.resolve(clientPage(rows, p, ps)), [rows]);
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<any>({ fetchFn, pageSize: 20 });

  return (
    <div>
      <div className={`${CARD} mb-6 flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <DateRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
          <select value={departmentId} onChange={(e) => setDept(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary">
            <option value="">All Departments</option>
            {departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <button
          onClick={() => downloadCsv('attendance-summary.csv',
            ['Employee', 'Department', 'Total Days', 'Present', 'Absent', 'Late', 'On Leave', 'Attendance Rate %'],
            rows.map((r: any) => [r.name, r.department ?? '', r.totalDays, r.presentDays, r.absentDays, r.lateDays, r.leaveDays, r.attendanceRate]))}
          disabled={rows.length === 0}
          className="btn-secondary disabled:opacity-40"
        ><Download size={15} /> Export CSV</button>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><th className={TH}>Employee</th><th className={TH}>Department</th><th className={`${TH} text-right`}>Total Days</th><th className={`${TH} text-right`}>Present</th><th className={`${TH} text-right`}>Absent</th><th className={`${TH} text-right`}>Late</th><th className={`${TH} text-right`}>On Leave</th><th className={`${TH} text-right`}>Attendance Rate</th></tr></thead>
            <tbody>
              {!initialLoading && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">No data for this range.</td></tr>}
              {pageRows.map((r: any) => (
                <tr key={r.employeeId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className={`${CELL} font-medium text-charcoal-heading`}>{r.name}</td>
                  <td className={`${CELL} text-slate-600`}>{r.department ?? '—'}</td>
                  <td className={`${CELL} text-right`}>{r.totalDays}</td>
                  <td className={`${CELL} text-right`}>{r.presentDays}</td>
                  <td className={`${CELL} text-right`}>{r.absentDays}</td>
                  <td className={`${CELL} text-right`}>{r.lateDays}</td>
                  <td className={`${CELL} text-right`}>{r.leaveDays}</td>
                  <td className={`${CELL} text-right font-semibold`} style={{ color: rateColor(r.attendanceRate) }}>{r.attendanceRate}%</td>
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

// 2. Leave Liability ────────────────────────────────────────────────────────────
function LeaveLiabilityTab() {
  const { data: rows = [] } = useQuery({ queryKey: ['rpt-leave-liability'], queryFn: () => api.get('/workforce/reports/leave-liability').then((r) => r.data) });
  const totalCost = rows.reduce((s: number, r: any) => s + (r.estimatedCostCents ?? 0), 0);
  const totalRemaining = rows.reduce((s: number, r: any) => s + (r.remaining ?? 0), 0);
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-slate-100"><th className={TH}>Employee</th><th className={TH}>Leave Type</th><th className={`${TH} text-right`}>Entitlement</th><th className={`${TH} text-right`}>Used</th><th className={`${TH} text-right`}>Pending</th><th className={`${TH} text-right`}>Remaining</th><th className={`${TH} text-right`}>Est. Cost</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">No leave balances for this year.</td></tr>}
            {rows.map((r: any, i: number) => (
              <tr key={`${r.employeeId}-${r.leaveType}-${i}`} className="border-b border-slate-100 hover:bg-slate-50">
                <td className={`${CELL} font-medium text-charcoal-heading`}>{r.name}</td>
                <td className={`${CELL} text-slate-600`}>{r.leaveType}</td>
                <td className={`${CELL} text-right`}>{r.entitlement}</td>
                <td className={`${CELL} text-right`}>{r.used}</td>
                <td className={`${CELL} text-right`}>{r.pending}</td>
                <td className={`${CELL} text-right font-semibold text-charcoal-heading`}>{r.remaining}</td>
                <td className={`${CELL} text-right`}>{fmtMoney(r.estimatedCostCents)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/60">
                <td className={`${CELL} font-bold`} colSpan={5}>Totals</td>
                <td className={`${CELL} text-right font-bold`}>{totalRemaining}</td>
                <td className={`${CELL} text-right font-bold`}>{fmtMoney(totalCost)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// 3. Overtime Cost ──────────────────────────────────────────────────────────────
function OvertimeCostTab() {
  const [start, setStart] = useState(iso(new Date(Date.now() - 29 * 86_400_000)));
  const [end, setEnd] = useState(iso(new Date()));
  const params = { startDate: start, endDate: end };
  const { data: rows = [] } = useQuery({
    queryKey: ['rpt-overtime-cost', params],
    queryFn: () => api.get('/workforce/reports/overtime-cost', { params }).then((r) => r.data),
    enabled: !!start && !!end,
  });
  const totalMinutes = rows.reduce((s: number, r: any) => s + (r.totalOvertimeMinutes ?? 0), 0);
  const totalCost = rows.reduce((s: number, r: any) => s + (r.estimatedOvertimeCostCents ?? 0), 0);

  return (
    <div>
      <div className={`${CARD} mb-6 p-4`}><DateRange start={start} end={end} onStart={setStart} onEnd={setEnd} /></div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={`${CARD} flex items-center gap-3 p-5`}><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Timer size={20} /></span><div><div className="text-3xl font-bold leading-none text-charcoal-heading">{fmtHours(totalMinutes)}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total OT Hours</div></div></div>
        <div className={`${CARD} flex items-center gap-3 p-5`}><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><BarChart3 size={20} /></span><div><div className="text-3xl font-bold leading-none text-charcoal-heading">{fmtMoney(totalCost)}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total Est. Cost</div></div></div>
      </div>
      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><th className={TH}>Employee</th><th className={`${TH} text-right`}>Total OT Hours</th><th className={`${TH} text-right`}>Rate</th><th className={`${TH} text-right`}>Est. Cost</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-400">No overtime in this range.</td></tr>}
              {rows.map((r: any) => (
                <tr key={r.employeeId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className={`${CELL} font-medium text-charcoal-heading`}>{r.name}</td>
                  <td className={`${CELL} text-right`}>{fmtHours(r.totalOvertimeMinutes)}</td>
                  <td className={`${CELL} text-right`}>{fmtMultiplier(r.rateMultiplierX100)}</td>
                  <td className={`${CELL} text-right font-semibold text-charcoal-heading`}>{fmtMoney(r.estimatedOvertimeCostCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 4. Timesheet Summary ──────────────────────────────────────────────────────────
function TimesheetSummaryTab() {
  const [start, setStart] = useState(iso(new Date(Date.now() - 29 * 86_400_000)));
  const [end, setEnd] = useState(iso(new Date()));
  const params = { startDate: start, endDate: end };
  const { data: rows = [] } = useQuery({
    queryKey: ['rpt-timesheet-summary', params],
    queryFn: () => api.get('/workforce/reports/timesheet-summary', { params }).then((r) => r.data),
    enabled: !!start && !!end,
  });

  return (
    <div>
      <div className={`${CARD} mb-6 p-4`}><DateRange start={start} end={end} onStart={setStart} onEnd={setEnd} /></div>
      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><th className={TH}>Employee</th><th className={`${TH} text-right`}>Regular Hrs</th><th className={`${TH} text-right`}>OT Hrs</th><th className={`${TH} text-right`}>Submitted</th><th className={`${TH} text-right`}>Approved</th><th className={`${TH} text-right`}>Pending</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">No timesheets in this range.</td></tr>}
              {rows.map((r: any) => (
                <tr key={r.employeeId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className={`${CELL} font-medium text-charcoal-heading`}>{r.name}</td>
                  <td className={`${CELL} text-right`}>{fmtHours(r.totalRegularMinutes)}</td>
                  <td className={`${CELL} text-right`}>{fmtHours(r.totalOvertimeMinutes)}</td>
                  <td className={`${CELL} text-right`}>{r.submittedCount}</td>
                  <td className={`${CELL} text-right`}>{r.approvedCount}</td>
                  <td className={`${CELL} text-right font-semibold`} style={{ color: r.pendingCount > 0 ? WARN_FG : undefined }}>{r.pendingCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { key: 'attendance', label: 'Attendance Summary', icon: BarChart3 },
  { key: 'liability', label: 'Leave Liability', icon: CalendarOff },
  { key: 'overtime', label: 'Overtime Cost', icon: Timer },
  { key: 'timesheet', label: 'Timesheet Summary', icon: FileClock },
] as const;

function ReportsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('attendance');

  if (!can('employee:change')) {
    return <div className={`${CARD} p-8 text-sm text-secondary`}>Workforce reports require a manager or admin role.</div>;
  }

  return (
    <div className="w-full">
      <div className="mb-5">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Workforce Reports</h1>
        <p className="mt-1 text-sm text-secondary">Attendance, leave liability, overtime cost and timesheet rollups.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-on-surface'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'liability' && <LeaveLiabilityTab />}
      {tab === 'overtime' && <OvertimeCostTab />}
      {tab === 'timesheet' && <TimesheetSummaryTab />}
    </div>
  );
}

export default function Page() {
  return (
    <FeatureGate feature="WORKFORCE_MANAGEMENT" fallback={<div className="p-8 text-sm text-secondary">Workforce Management is not enabled for this lab.</div>}>
      <ReportsPage />
    </FeatureGate>
  );
}
