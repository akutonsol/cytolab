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
import { Card, Button, DataToolbar, Th, Td, TableEmpty } from '@/components/ui';

// Stable empty fallback so the infinite-scroll fetchFn identity is stable while loading.
const NO_ROWS: any[] = [];
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
      <span className="text-sm text-slate-500">to</span>
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
      <Card radius="sm" elevation="sm" border="subtle" className="mb-6 p-4">
        <DataToolbar
          leading={
            <>
              <DateRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
              <select value={departmentId} onChange={(e) => setDept(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary">
                <option value="">All Departments</option>
                {departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </>
          }
          trailing={
            <Button variant="secondary" onClick={() => downloadCsv('attendance-summary.csv',
                ['Employee', 'Department', 'Total Days', 'Present', 'Absent', 'Late', 'On Leave', 'Attendance Rate %'],
                rows.map((r: any) => [r.name, r.department ?? '', r.totalDays, r.presentDays, r.absentDays, r.lateDays, r.leaveDays, r.attendanceRate]))}
              disabled={rows.length === 0}
              className="disabled:opacity-40"><Download size={15} /> Export CSV</Button>
          }
        />
      </Card>

      <Card radius="sm" elevation="sm" border="subtle" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><Th density="compact" size="xs">Employee</Th><Th density="compact" size="xs">Department</Th><Th density="compact" size="xs" className="text-right">Total Days</Th><Th density="compact" size="xs" className="text-right">Present</Th><Th density="compact" size="xs" className="text-right">Absent</Th><Th density="compact" size="xs" className="text-right">Late</Th><Th density="compact" size="xs" className="text-right">On Leave</Th><Th density="compact" size="xs" className="text-right">Attendance Rate</Th></tr></thead>
            <tbody>
              {!initialLoading && rows.length === 0 && <TableEmpty colSpan={8}>No data for this range.</TableEmpty>}
              {pageRows.map((r: any) => (
                <tr key={r.employeeId} className="border-b border-slate-100 hover:bg-slate-50">
                  <Td density="compact" tone="inherit" className="text-sm font-medium text-charcoal-heading">{r.name}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-slate-600">{r.department ?? '—'}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right">{r.totalDays}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right">{r.presentDays}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right">{r.absentDays}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right">{r.lateDays}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right">{r.leaveDays}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right font-semibold" style={{ color: rateColor(r.attendanceRate) }}>{r.attendanceRate}%</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageRows.length > 0 && <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />}
      </Card>
    </div>
  );
}

// 2. Leave Liability ────────────────────────────────────────────────────────────
function LeaveLiabilityTab() {
  const { data: rows = [] } = useQuery({ queryKey: ['rpt-leave-liability'], queryFn: () => api.get('/workforce/reports/leave-liability').then((r) => r.data) });
  const totalCost = rows.reduce((s: number, r: any) => s + (r.estimatedCostCents ?? 0), 0);
  const totalRemaining = rows.reduce((s: number, r: any) => s + (r.remaining ?? 0), 0);
  return (
    <Card radius="sm" elevation="sm" border="subtle" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-slate-100"><Th density="compact" size="xs">Employee</Th><Th density="compact" size="xs">Leave Type</Th><Th density="compact" size="xs" className="text-right">Entitlement</Th><Th density="compact" size="xs" className="text-right">Used</Th><Th density="compact" size="xs" className="text-right">Pending</Th><Th density="compact" size="xs" className="text-right">Remaining</Th><Th density="compact" size="xs" className="text-right">Est. Cost</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={7}>No leave balances for this year.</TableEmpty>}
            {rows.map((r: any, i: number) => (
              <tr key={`${r.employeeId}-${r.leaveType}-${i}`} className="border-b border-slate-100 hover:bg-slate-50">
                <Td density="compact" tone="inherit" className="text-sm font-medium text-charcoal-heading">{r.name}</Td>
                <Td density="compact" tone="inherit" className="text-sm text-slate-600">{r.leaveType}</Td>
                <Td density="compact" tone="inherit" className="text-sm text-right">{r.entitlement}</Td>
                <Td density="compact" tone="inherit" className="text-sm text-right">{r.used}</Td>
                <Td density="compact" tone="inherit" className="text-sm text-right">{r.pending}</Td>
                <Td density="compact" tone="inherit" className="text-sm text-right font-semibold text-charcoal-heading">{r.remaining}</Td>
                <Td density="compact" tone="inherit" className="text-sm text-right">{fmtMoney(r.estimatedCostCents)}</Td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/60">
                <Td density="compact" tone="inherit" className="text-sm font-bold" colSpan={5}>Totals</Td>
                <Td density="compact" tone="inherit" className="text-sm text-right font-bold">{totalRemaining}</Td>
                <Td density="compact" tone="inherit" className="text-sm text-right font-bold">{fmtMoney(totalCost)}</Td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
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
      <Card radius="sm" elevation="sm" border="subtle" className="mb-6 p-4"><DateRange start={start} end={end} onStart={setStart} onEnd={setEnd} /></Card>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card radius="sm" elevation="sm" border="subtle" className="flex items-center gap-3 p-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Timer size={20} /></span><div><div className="text-3xl font-bold leading-none text-charcoal-heading">{fmtHours(totalMinutes)}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total OT Hours</div></div></Card>
        <Card radius="sm" elevation="sm" border="subtle" className="flex items-center gap-3 p-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><BarChart3 size={20} /></span><div><div className="text-3xl font-bold leading-none text-charcoal-heading">{fmtMoney(totalCost)}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Est. Cost</div></div></Card>
      </div>
      <Card radius="sm" elevation="sm" border="subtle" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><Th density="compact" size="xs">Employee</Th><Th density="compact" size="xs" className="text-right">Total OT Hours</Th><Th density="compact" size="xs" className="text-right">Rate</Th><Th density="compact" size="xs" className="text-right">Est. Cost</Th></tr></thead>
            <tbody>
              {rows.length === 0 && <TableEmpty colSpan={4}>No overtime in this range.</TableEmpty>}
              {rows.map((r: any) => (
                <tr key={r.employeeId} className="border-b border-slate-100 hover:bg-slate-50">
                  <Td density="compact" tone="inherit" className="text-sm font-medium text-charcoal-heading">{r.name}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right">{fmtHours(r.totalOvertimeMinutes)}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right">{fmtMultiplier(r.rateMultiplierX100)}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right font-semibold text-charcoal-heading">{fmtMoney(r.estimatedOvertimeCostCents)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
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
      <Card radius="sm" elevation="sm" border="subtle" className="mb-6 p-4"><DateRange start={start} end={end} onStart={setStart} onEnd={setEnd} /></Card>
      <Card radius="sm" elevation="sm" border="subtle" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-100"><Th density="compact" size="xs">Employee</Th><Th density="compact" size="xs" className="text-right">Regular Hrs</Th><Th density="compact" size="xs" className="text-right">OT Hrs</Th><Th density="compact" size="xs" className="text-right">Submitted</Th><Th density="compact" size="xs" className="text-right">Approved</Th><Th density="compact" size="xs" className="text-right">Pending</Th></tr></thead>
            <tbody>
              {rows.length === 0 && <TableEmpty colSpan={6}>No timesheets in this range.</TableEmpty>}
              {rows.map((r: any) => (
                <tr key={r.employeeId} className="border-b border-slate-100 hover:bg-slate-50">
                  <Td density="compact" tone="inherit" className="text-sm font-medium text-charcoal-heading">{r.name}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right">{fmtHours(r.totalRegularMinutes)}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right">{fmtHours(r.totalOvertimeMinutes)}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right">{r.submittedCount}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right">{r.approvedCount}</Td>
                  <Td density="compact" tone="inherit" className="text-sm text-right font-semibold" style={{ color: r.pendingCount> 0 ? WARN_FG : undefined }}>{r.pendingCount}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
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
    return <Card radius="sm" elevation="sm" border="subtle" className="p-8 text-sm text-secondary">Workforce reports require a manager or admin role.</Card>;
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
