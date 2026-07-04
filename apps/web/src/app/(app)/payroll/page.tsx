'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Calculator, ChevronRight, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { type Advice, type Run, jmd, money, monthYear, thisMonth, fmtDate } from '@/lib/payroll';

interface Stats { totalRuns: number; latest: Run | null }

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  Paid: { bg: '#F0FDF4', color: '#16A34A' },
  Issued: { bg: '#EEF2FF', color: '#4F46E5' },
  Draft: { bg: '#F1F5F9', color: '#64748B' },
};

export default function PayrollLandingPage() {
  const router = useRouter();
  const { data: stats } = useQuery({ queryKey: ['payroll-stats'], queryFn: () => api.get<Stats>('/payroll/stats').then((r) => r.data) });
  const { data: advicesData } = useQuery({ queryKey: ['payroll-journal'], queryFn: () => api.get<Paginated<Advice>>('/payroll/advices', { params: { pageSize: 100 } }).then((r) => r.data) });
  const advices = advicesData?.data ?? [];
  const latest = stats?.latest ?? null;

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="px-6 py-8 lg:px-8">
        {/* Hero */}
        <div className="glass-card mb-6 flex flex-wrap items-center justify-between gap-6 rounded-2xl p-8" style={{ background: 'linear-gradient(120deg, #F5F3FF 0%, #EEF2FF 100%)' }}>
          <div className="flex items-center gap-5">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white shadow-sm" style={{ color: '#4F46E5' }}><Calculator size={30} /></span>
            <div>
              <h1 className="text-3xl font-bold text-charcoal-heading lg:text-4xl">Run Payroll for {monthYear(thisMonth())}</h1>
              <p className="mt-1 font-body-sm text-body-sm text-secondary">Process payroll for all active employees for this period.</p>
            </div>
          </div>
          <button className="btn-primary !h-12 !px-6 !text-[15px]" onClick={() => router.push('/payroll/wizard')}>
            <Calculator size={18} /> Run Salary Payroll
          </button>
        </div>

        {/* KPI + Most Recent Payroll */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="glass-card rounded-2xl p-6">
            <div className="font-display text-4xl font-bold leading-none text-[#0F172A] lg:text-5xl">{stats?.totalRuns ?? 0}</div>
            <div className="mt-2 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Payroll Runs</div>
          </div>
          <div className="glass-card rounded-2xl p-6">
            <div className="font-display text-4xl font-bold leading-none text-[#0F172A] lg:text-5xl">{advices.length}</div>
            <div className="mt-2 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Pay Advices</div>
          </div>

          {/* Most Recent Payroll */}
          {latest ? (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Most Recent Payroll</span>
                <Link href={`/payroll/run/${latest.id}`} className="flex items-center gap-1 font-label-sm text-label-sm font-semibold text-primary hover:underline">View Details <ArrowRight size={13} /></Link>
              </div>
              <div className="mt-2 font-body-sm text-body-sm text-secondary">{fmtDate(latest.payrollDate)}</div>
              <div className="mt-1 font-display text-3xl font-bold leading-none text-[#0F172A]">{money(latest.totalGross)}</div>
              <div className="mt-2 flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5 font-body-sm text-body-sm text-secondary"><Users size={14} /> {latest.employeeCount} paid</span>
                <span className="font-body-sm text-body-sm text-secondary">NET {money(latest.totalNet)}</span>
              </div>
            </div>
          ) : (
            <div className="glass-card flex items-center justify-center rounded-2xl p-6 text-center font-body-sm text-body-sm text-secondary">No payroll processed yet.</div>
          )}
        </div>

        {/* Payroll Journal */}
        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="border-b border-outline-variant/40 px-5 py-4"><h2 className="font-headline-sm text-headline-sm text-charcoal-heading">Payroll Journal</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/40 bg-surface-container-low/40">
                  {['Employee', 'Taxes', 'Payroll Period', 'Amount', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {advices.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-14 text-center font-body-sm text-body-sm text-secondary">No pay advices yet — run payroll to populate the journal.</td></tr>
                ) : advices.map((a) => {
                  const taxes = a.nis + a.nht + a.edTax + a.paye;
                  const b = STATUS_BADGE[a.status] ?? STATUS_BADGE.Draft;
                  return (
                    <tr key={a.id} className="border-b border-surface-container-low transition-colors hover:bg-surface-container-low/50">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 rounded-full bg-surface-container-low px-2.5 py-1">
                          <span className="font-body-sm text-body-sm font-semibold text-charcoal-heading">{a.employee.user.firstName} {a.employee.user.lastName}</span>
                          <span className="font-mono text-[11px] text-secondary">{a.employee.employeeNo}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-body-sm text-body-sm text-secondary">{money(taxes)}</td>
                      <td className="px-4 py-3 font-body-sm text-body-sm text-secondary">{monthYear(a.period)}</td>
                      <td className="px-4 py-3 font-body-sm text-body-sm font-semibold text-charcoal-heading">{money(a.netPay)}</td>
                      <td className="px-4 py-3"><span style={{ background: b.bg, color: b.color }} className="inline-block rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium">{a.status}</span></td>
                      <td className="px-4 py-3">
                        <Link href={`/payroll/slip/${a.id}`} className="inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold text-primary hover:underline">View Details <ChevronRight size={13} /></Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
