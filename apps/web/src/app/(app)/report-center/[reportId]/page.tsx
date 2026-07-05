'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { App as AntdApp } from 'antd';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { donutColor, fmtValue, getPath, reportById, toCsv } from '@/lib/report-center';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const STATUS_COLOR: Record<string, { fg: string; bg: string }> = {
  Compliant: { fg: '#16A34A', bg: '#DCFCE7' },
  Warning: { fg: '#B45309', bg: '#FFFBEB' },
  'Non-Compliant': { fg: '#B91C1C', bg: '#FEE2E2' },
};

export default function ReportRunnerPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const router = useRouter();
  const { message } = AntdApp.useApp();
  const { isEnabled } = useFeatures();
  const def = reportById(reportId);

  const [dateFrom, setDateFrom] = useState(iso(new Date(Date.now() - 365 * 86_400_000)));
  const [dateTo, setDateTo] = useState(iso(new Date()));
  const [applied, setApplied] = useState({ dateFrom, dateTo });

  const { data, isFetching } = useQuery({
    queryKey: ['rc-report', reportId, applied.dateFrom, applied.dateTo],
    queryFn: () => api.get(def!.endpoint, { params: { dateFrom: applied.dateFrom, dateTo: applied.dateTo } }).then((r) => r.data),
    enabled: !!def && isEnabled('REPORT_CENTER'),
  });

  if (!isEnabled('REPORT_CENTER')) return <div className="grid h-[60vh] place-items-center text-[#64748B]">The Report Center is disabled for this lab.</div>;
  if (!def) return <div className="grid h-[60vh] place-items-center text-[#94A3B8]">Unknown report.</div>;

  const runReport = () => setApplied({ dateFrom, dateTo });
  const exportCsv = () => {
    const csv = toCsv(def, data);
    if (!csv) { message.info('Nothing to export.'); return; }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${def.id}.csv`; a.click(); URL.revokeObjectURL(url);
    message.success('CSV downloaded');
  };

  const tableRows: any[] = def.table ? (getPath(data, def.table.rowsPath) ?? []) : [];
  const chartData: any[] = def.chart ? (getPath(data, def.chart.dataPath) ?? []) : [];

  return (
    <div className="report-print min-h-full px-6 pb-10 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
      <button onClick={() => router.push(`/report-center?tab=${def.category.toLowerCase()}`)} className="no-print mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-[#64748B] hover:text-[#0F172A]"><ArrowLeft size={15} /> Report Center</button>

      <div className="mb-5">
        <h1 className="text-[24px] font-bold tracking-tight text-[#0F172A]">{def.name}</h1>
        <p className="mt-1 text-[14px] text-[#6B7280]">{def.description}</p>
      </div>

      {/* Controls */}
      <div className={`${CARD} no-print mb-5 flex flex-wrap items-end gap-3 p-4`}>
        <div><label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">From</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px]" /></div>
        <div><label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">To</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px]" /></div>
        <button onClick={runReport} className="rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white">Run Report</button>
        <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#334155]"><Download size={15} /> Export CSV</button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-[14px] font-semibold text-[#334155]"><Printer size={15} /></button>
        {isFetching && <span className="text-[13px] text-[#94A3B8]">Running…</span>}
      </div>

      {/* CAP benchmarks — dedicated status layout */}
      {def.id === 'cap-benchmarks' ? (
        <div className="printable">
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {([['ASC:SIL Ratio', 'ascSilRatio', 'ratio'], ['Unsatisfactory Rate', 'unsatisfactoryRate', 'percent'], ['TAT Compliance', 'tatCompliance', 'percent'], ['QC Pass Rate', 'qcPassRate', 'percent']] as const).map(([label, key, fmt]) => {
              const m = data?.[key]; const sc = STATUS_COLOR[m?.status] ?? STATUS_COLOR.Warning;
              return (
                <div key={key} className={`${CARD} p-4`}>
                  <div className="text-[13px] text-[#64748B]">{label}</div>
                  <div className="mt-1 text-[32px] font-bold text-[#0F172A]">{m ? fmtValue(m.value, fmt as any) : '—'}</div>
                  <div className="mt-1 text-[12px] text-[#94A3B8]">Benchmark {m ? fmtValue(m.benchmark, fmt as any) : '—'}</div>
                  {m && <span className="mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: sc.bg, color: sc.fg }}>{m.status}</span>}
                </div>
              );
            })}
          </div>
          <div className={`${CARD} flex items-center justify-between p-5`}>
            <span className="text-[15px] font-bold text-[#0F172A]">Overall Compliance</span>
            {data?.overall && <span className="rounded-full px-3 py-1 text-[14px] font-bold" style={{ background: (STATUS_COLOR[data.overall] ?? STATUS_COLOR.Warning).bg, color: (STATUS_COLOR[data.overall] ?? STATUS_COLOR.Warning).fg }}>{data.overall}</span>}
          </div>
        </div>
      ) : (
        <div className="printable">
          {/* KPI strip */}
          {def.kpis && (
            <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {def.kpis.map((k) => (
                <div key={k.path} className={`${CARD} p-4`}>
                  <div className="text-[13px] text-[#64748B]">{k.label}</div>
                  <div className="mt-1 text-[32px] font-bold leading-none text-[#0F172A]">{data ? fmtValue(getPath(data, k.path), k.format) : '—'}</div>
                </div>
              ))}
            </div>
          )}

          {/* Chart */}
          {def.chart && chartData.length > 0 && (
            <div className={`${CARD} mb-5 p-4`}>
              <ResponsiveContainer width="100%" height={300}>
                {def.chart.type === 'donut' ? (
                  <PieChart>
                    <Pie data={chartData} dataKey={def.chart.valueKey!} nameKey={def.chart.nameKey!} cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={2}>
                      {chartData.map((_, i) => <Cell key={i} fill={donutColor(i)} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                ) : def.chart.type === 'bar' ? (
                  <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" />
                    <XAxis dataKey={def.chart.xKey} tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EEF2F7', fontSize: 13 }} /><Legend />
                    {def.chart.series!.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} />)}
                  </BarChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" />
                    <XAxis dataKey={def.chart.xKey} tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EEF2F7', fontSize: 13 }} /><Legend />
                    {def.chart.series!.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.2} dot={false} activeDot={{ r: 5 }} />)}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          {def.table && (
            <div className={`${CARD} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#94A3B8]">
                    {def.table.columns.map((c) => <th key={c.key} className="px-3 py-2.5 font-semibold">{c.label}</th>)}
                  </tr></thead>
                  <tbody>
                    {tableRows.length === 0 ? (
                      <tr><td colSpan={def.table.columns.length} className="px-3 py-12 text-center text-[#94A3B8]">No data for this period.</td></tr>
                    ) : tableRows.map((row, i) => (
                      <tr key={i} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                        {def.table!.columns.map((c, ci) => (
                          <td key={c.key} className="px-3 py-2.5" style={ci === 0 ? { fontWeight: 600, color: '#0F172A' } : { color: '#334155' }}>{fmtValue(row[c.key], c.format)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
