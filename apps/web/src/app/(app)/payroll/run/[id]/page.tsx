'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Printer, ShieldCheck, XCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PayslipCard } from '@/components/PayslipCard';
import { money, monthYear, fmtDate, type RunDetail, type SlipData } from '@/lib/payroll';

export default function PayrollReportPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const id = String(useParams().id);
  const [openSection, setOpenSection] = useState<string | null>('tax');

  const { data: run, isLoading } = useQuery({
    queryKey: ['payroll-run', id],
    queryFn: () => api.get<RunDetail>(`/payroll/runs/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const approve = useMutation({
    mutationFn: () => api.put(`/payroll/runs/approve/${id}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-run', id] }),
  });

  if (isLoading || !run) {
    return <div className="min-h-full p-8" style={{ background: '#F8FAFC' }}><div className="rounded-2xl border border-[#E2E8F0] bg-white p-12 text-center text-[14px] text-[#64748B]">Loading payroll report…</div></div>;
  }

  const taxes = run.payAdvices.reduce((s, a) => s + a.nis + a.nht + a.edTax + a.paye, 0);
  const verified = !!run.integrityHash && run.status === 'Completed';
  const year = new Date().getFullYear();
  const toggle = (k: string) => setOpenSection((c) => (c === k ? null : k));

  const slips: SlipData[] = run.payAdvices.map((a) => ({
    ...a,
    payrollRun: { period: run.period, payrollDate: run.payrollDate, runNumber: run.runNumber },
    lab: run.lab ?? null,
  }));

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="px-6 py-8 lg:px-8">
        <button onClick={() => router.push('/payroll')} className="no-print mb-4 flex items-center gap-1.5 text-[13px] font-medium text-[#64748B] hover:text-[#0F172A]"><ArrowLeft size={15} /> Payroll</button>

        <div className="no-print grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Payroll Receipt */}
          <div className="glass-card rounded-2xl p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-headline-sm text-charcoal-heading">Payroll Receipt #{run.runNumber}</h2>
              <span className="font-mono text-[12px] text-secondary">{monthYear(run.period)}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <Meta label="Employees Paid" value={String(run.employeeCount)} />
              <Meta label="Payroll Period" value={monthYear(run.period)} />
              <Meta label="For Government Taxes" value={money(taxes)} />
            </div>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-[#F1F5F9] pt-5">
              <div>
                <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Net Payout</div>
                <div className="font-display text-[22px] font-bold text-[#0F172A]">{money(run.totalNet)}</div>
              </div>
              <div className="text-right">
                <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Payout Total</div>
                <div className="font-display text-[30px] font-bold text-[#0F172A]">{money(run.totalGross)}</div>
              </div>
            </div>
            {/* Legal disclaimer */}
            <div className="mt-5 space-y-2 border-t border-[#F1F5F9] pt-4">
              <p className="text-xs text-slate-400">
                These amounts may not represent all monies due to you from government tax authorities, and do not include any amounts transmitted outside the CytoLabs platform.
              </p>
              <p className="text-xs text-slate-400">
                © {year} {run.lab?.name ?? ''} {run.lab?.address ?? ''} {run.lab?.phone ?? ''} CytoLabs Payroll, is not a licensed money transmitter. For more about CytoLabs&apos;s licenses and your state-specific rights to request information, submit complaints, dispute errors, or cancel transactions.
              </p>
            </div>
          </div>

          {/* Meta + Approved-by */}
          <div className="flex flex-col gap-5">
            <div className="glass-card rounded-2xl p-6">
              <div className="mb-3 font-headline-sm text-headline-sm text-charcoal-heading">Payroll Meta Data</div>
              <MetaRow label="Integrity">
                {verified ? (
                  <span className="inline-flex items-center gap-1.5 font-body-sm text-body-sm font-semibold" style={{ color: '#16A34A' }}><CheckCircle2 size={15} /> Verified</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-body-sm text-body-sm font-semibold" style={{ color: '#EF4444' }}><XCircle size={15} /> Unverified</span>
                )}
              </MetaRow>
              <MetaRow label="Created On"><span className="font-body-sm text-body-sm text-on-surface">{fmtDate(run.createdAt)}</span></MetaRow>
              <MetaRow label="Approved Date"><span className="font-body-sm text-body-sm text-on-surface">{run.approvedAt ? fmtDate(run.approvedAt) : '—'}</span></MetaRow>
              <MetaRow label="Status">
                <span className="inline-block rounded-full px-2.5 py-0.5 font-label-sm text-label-sm font-medium" style={{ background: run.status === 'Completed' ? '#F0FDF4' : '#F1F5F9', color: run.status === 'Completed' ? '#16A34A' : '#64748B' }}>{run.status}</span>
              </MetaRow>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <div className="mb-3 font-headline-sm text-headline-sm text-charcoal-heading">Approved By</div>
              {run.approvedAt ? (
                <>
                  <div className="font-body-sm text-body-sm text-on-surface">{run.approvedBy?.firstName} {run.approvedBy?.lastName}</div>
                  <div className="font-body-sm text-body-sm text-secondary">{fmtDate(run.approvedAt)}</div>
                  {run.approvalNotes && <p className="mt-2 font-body-sm text-body-sm text-secondary">{run.approvalNotes}</p>}
                </>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body-sm text-body-sm text-secondary">Not yet approved.</span>
                  <button className="btn-primary !px-3 !py-1.5 !text-[13px]" disabled={approve.isPending} onClick={() => approve.mutate()}><ShieldCheck size={14} /> Approve</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible sections */}
        <div className="no-print mt-6 flex flex-col gap-3">
          <Section title="View Tax Collection Summary" open={openSection === 'tax'} onToggle={() => toggle('tax')}>
            <table className="w-full border-collapse text-[13px]">
              <thead><tr className="border-b border-outline-variant/40 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary"><th className="px-3 py-2">Tax</th><th className="px-3 py-2">Percent</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
              <tbody>
                {[['NIS', '3.0%', run.payAdvices.reduce((s, a) => s + a.nis, 0)], ['NHT', '2.0%', run.payAdvices.reduce((s, a) => s + a.nht, 0)], ['EDTAX', '2.25%', run.payAdvices.reduce((s, a) => s + a.edTax, 0)], ['PAYE', '25%', run.payAdvices.reduce((s, a) => s + a.paye, 0)]].map(([n, p, v]) => (
                  <tr key={n as string} className="border-b border-surface-container-low"><td className="px-3 py-2 font-medium">{n}</td><td className="px-3 py-2 text-secondary">{p}</td><td className="px-3 py-2 text-right">{money(v as number)}</td></tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="View Employees Pay Advice Summary" open={openSection === 'adv'} onToggle={() => toggle('adv')}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead><tr className="border-b border-outline-variant/40 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary">
                  <th className="px-3 py-2">Employee</th><th className="px-3 py-2 text-right">Added Earnings</th><th className="px-3 py-2 text-right">Deductions</th><th className="px-3 py-2 text-right">Gross Pay</th><th className="px-3 py-2 text-right">Taxes</th><th className="px-3 py-2 text-right">Net Pay</th>
                </tr></thead>
                <tbody>
                  {run.payAdvices.map((a) => (
                    <tr key={a.id} className="border-b border-surface-container-low">
                      <td className="px-3 py-2"><span className="font-semibold text-charcoal-heading">{a.employee.user.firstName} {a.employee.user.lastName}</span> <span className="font-mono text-[11px] text-secondary">{a.employee.employeeNo}</span></td>
                      <td className="px-3 py-2 text-right">{money(a.commission + a.bonus)}</td>
                      <td className="px-3 py-2 text-right">{money(a.grossPay - a.netPay)}</td>
                      <td className="px-3 py-2 text-right">{money(a.grossPay)}</td>
                      <td className="px-3 py-2 text-right">{money(a.nis + a.nht + a.edTax + a.paye)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-charcoal-heading">{money(a.netPay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="View Pay Advice Slips" open={openSection === 'slips'} onToggle={() => toggle('slips')}
            action={<button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 px-3 py-1.5 font-label-sm text-label-sm font-semibold text-primary hover:bg-primary-fixed"><Printer size={14} /> Print All Slips</button>}>
            <div className="printable flex flex-col gap-6">
              {slips.map((s, i) => (
                <div key={s.id} className={i < slips.length - 1 ? 'print-break border-b border-[#E2E8F0] pb-6' : ''}>
                  <PayslipCard slip={s} />
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">{label}</div><div className="mt-1 font-body-sm text-body-sm font-semibold text-charcoal-heading">{value}</div></div>;
}
function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between border-b border-[#F1F5F9] py-2 last:border-b-0"><span className="font-label-sm text-label-sm text-secondary">{label}</span>{children}</div>;
}
function Section({ title, open, onToggle, action, children }: { title: string; open: boolean; onToggle: () => void; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-card overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={onToggle} className="flex items-center gap-1.5 font-label-md text-label-md font-semibold text-charcoal-heading">
          {open ? <ChevronDown size={16} className="text-primary" /> : <ChevronRight size={16} className="text-primary" />} {title}
        </button>
        {open && action}
      </div>
      {open && <div className="border-t border-outline-variant/30 p-5">{children}</div>}
    </div>
  );
}
