'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { fireGuideSignal } from '@/lib/guide/store';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { money, monthYear, thisMonth, fmtDate, previewAdvice, type RunDetail } from '@/lib/payroll';
import { Button } from '@/components/ui';

interface Emp {
  id: string; employeeNo: string; jobTitle: string; salary: number; isFixedSalary: boolean;
  nis: string | null; trn: string | null;
  user: { firstName: string; lastName: string };
}
interface Line { commission: number; bonus: number; pension: number; reimbursement: number; hoursWorked: number }
const emptyLine = (): Line => ({ commission: 0, bonus: 0, pension: 0, reimbursement: 0, hoursWorked: 0 });

const STEPS = ['Earnings', 'Taxes', 'Review', 'Finish'];
const PAGE = 50;
const tint = ['#4F46E5', '#16A34A', '#0284C7', '#7C3AED', '#E11D48'];
const initials = (s: string) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
// Cents from a JMD text input.
const toC = (v: string) => Math.round((parseFloat(v) || 0) * 100);
const fromC = (c: number) => (c ? String(Math.round(c / 100)) : '');

export default function PayrollWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [period, setPeriod] = useState(thisMonth());
  const [payrollDate, setPayrollDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [result, setResult] = useState<RunDetail | null>(null);
  const [approved, setApproved] = useState<RunDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showTax, setShowTax] = useState(false);
  const [showAdviceSummary, setShowAdviceSummary] = useState(false);
  const [showTaxCollected, setShowTaxCollected] = useState(false);

  const { data: empData } = useQuery({
    queryKey: ['wizard-employees'],
    queryFn: () => api.get<Paginated<Emp>>('/employees', { params: { pageSize: 500 } }).then((r) => r.data),
  });
  const employees = useMemo(() => (empData?.data ?? []).filter((e: any) => e.isActive), [empData]);
  const lineFor = (id: string) => lines[id] ?? emptyLine();
  const setLine = (id: string, patch: Partial<Line>) => setLines((p) => ({ ...p, [id]: { ...lineFor(id), ...patch } }));

  // Totals (client preview).
  const totals = useMemo(() => {
    let gross = 0, net = 0, ded = 0, nis = 0, nht = 0, edTax = 0, paye = 0;
    for (const e of employees) {
      const l = lineFor(e.id);
      const c = previewAdvice({ basicPay: e.salary, commission: l.commission, bonus: l.bonus, pension: l.pension, reimbursement: l.reimbursement });
      gross += c.grossPay; net += c.netPay; ded += c.deductions; nis += c.nis; nht += c.nht; edTax += c.edTax; paye += c.paye;
    }
    return { gross, net, ded, nis, nht, edTax, paye, taxes: nis + nht + edTax + paye };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, lines]);

  const process = useMutation({
    mutationFn: () => {
      const payload = {
        period, payrollDate: new Date(payrollDate).toISOString(),
        lines: employees.map((e) => ({ employeeId: e.id, ...lineFor(e.id) })),
      };
      return api.post<RunDetail>('/payroll/runs/process', payload).then((r) => r.data);
    },
    onSuccess: (d) => { setResult(d); setErr(null); setStep(3); fireGuideSignal('payroll:processed'); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Processing failed'),
  });

  const approve = useMutation({
    mutationFn: () => api.put<RunDetail>(`/payroll/runs/approve/${result!.id}`, {}).then((r) => r.data),
    onSuccess: (d) => setApproved(d),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Approval failed'),
  });

  // Infinite scroll over the active employees (editable payroll rows). Line
  // edits are keyed by employee id in `lines`, so they survive as rows append.
  const fetchFn = useCallback((p: number, ps: number) => Promise.resolve(clientPage(employees, p, ps)), [employees]);
  const { items: pageEmps, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<Emp>({ fetchFn, pageSize: PAGE });

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="py-8">
        {/* Header + progress */}
        <div className="mb-6">
          <button onClick={() => router.push('/payroll')} className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-[#475569] hover:text-[#0F172A]"><ArrowLeft size={15} /> Payroll</button>
          <h1 className="text-3xl font-bold text-charcoal-heading">Run Salary Payroll</h1>
          <div className="mt-4 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex flex-1 items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold ${i <= step ? 'text-white' : 'text-secondary'}`} style={{ background: i <= step ? '#4F46E5' : '#E2E8F0' }}>{i + 1}</span>
                  <span className={`font-label-md text-label-md ${i === step ? 'font-bold text-charcoal-heading' : 'text-secondary'}`}>{s}</span>
                </div>
                {i < STEPS.length - 1 && <div className="h-1 flex-1 rounded-full" style={{ background: i < step ? '#4F46E5' : '#E2E8F0' }} />}
              </div>
            ))}
          </div>
        </div>

        {err && <div className="mb-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] font-semibold text-[#991B1B]">{err}</div>}

        {/* ── Step 1: Earnings ── */}
        {step === 0 && (
          <div className="glass-card rounded-2xl p-6">
            <div className="mb-5 flex flex-wrap items-end gap-4">
              <div><label className="mb-1.5 block font-label-md text-label-md text-on-surface">Payroll period</label>
                <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={inp} /></div>
              <div><label className="mb-1.5 block font-label-md text-label-md text-on-surface">Payroll date</label>
                <input type="date" value={payrollDate} onChange={(e) => setPayrollDate(e.target.value)} className={inp} /></div>
              <div className="ml-auto text-right">
                <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Gross (preview)</div>
                <div className="font-display text-4xl font-bold leading-none text-[#0F172A] lg:text-5xl">{money(totals.gross)}</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-outline-variant/40 bg-surface-container-low/40 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary">
                    <th className="px-3 py-2.5">Employee</th>
                    <th className="px-3 py-2.5">Wages / Salary</th>
                    <th className="px-3 py-2.5">Additional Earnings</th>
                    <th className="px-3 py-2.5 text-right">Gross &amp; Deductions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageEmps.map((e, idx) => {
                    const l = lineFor(e.id);
                    const c = previewAdvice({ basicPay: e.salary, commission: l.commission, bonus: l.bonus, pension: l.pension, reimbursement: l.reimbursement });
                    return (
                      <tr key={e.id} className="border-b border-surface-container-low align-top">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: tint[idx % tint.length] }}>{initials(`${e.user.firstName} ${e.user.lastName}`)}</span>
                            <div>
                              <div className="font-semibold text-charcoal-heading">{e.user.firstName} {e.user.lastName}</div>
                              <div className="flex items-center gap-1.5 text-[11px] text-secondary">
                                <span className="font-mono">{e.employeeNo}</span>
                                <span className="rounded px-1.5 py-0.5 font-medium" style={{ background: e.isFixedSalary ? '#EEF2FF' : '#F0F9FF', color: e.isFixedSalary ? '#4F46E5' : '#0284C7' }}>{e.isFixedSalary ? 'Fixed' : 'Hourly'}</span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-secondary">TRN {e.trn || '—'} · NIS {e.nis || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-charcoal-heading">{money(e.salary)}<span className="font-normal text-secondary"> /mo</span></div>
                          <div className="text-[11px] text-secondary">{money(e.salary * 12)} /yr</div>
                          {!e.isFixedSalary && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span className="text-[11px] text-secondary">Hours</span>
                              <input type="number" min="0" value={l.hoursWorked || ''} onChange={(ev) => setLine(e.id, { hoursWorked: parseInt(ev.target.value) || 0 })} className={miniInp} placeholder="0" />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1.5">
                            <MoneyInput label="Commission" value={l.commission} onChange={(v) => setLine(e.id, { commission: v })} />
                            <MoneyInput label="Bonus" value={l.bonus} onChange={(v) => setLine(e.id, { bonus: v })} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="font-semibold text-charcoal-heading">{money(c.grossPay)}</div>
                          <div className="mt-1.5 flex flex-col items-end gap-1.5">
                            <MoneyInput label="Pension" value={l.pension} onChange={(v) => setLine(e.id, { pension: v })} minus />
                            <MoneyInput label="Reimbursement" value={l.reimbursement} onChange={(v) => setLine(e.id, { reimbursement: v })} minus />
                          </div>
                          <div className="mt-1.5 text-[11px] text-secondary">Net {money(c.netPay)}</div>
                        </td>
                      </tr>
                    );
                  })}
                  {employees.length === 0 && <tr><td colSpan={4} className="px-3 py-10 text-center text-secondary">No active employees to process.</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Infinite scroll: auto-loads more employee rows on scroll. */}
            {employees.length > 0 && (
              <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
            )}

            <div className="mt-4 flex items-center justify-between">
              <div className="font-label-sm text-label-sm text-secondary">
                Showing {pageEmps.length} of {employees.length} employees
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => router.push('/payroll')}>Back</Button>
                <Button disabled={employees.length === 0} style={{ opacity: employees.length === 0 ? 0.5 : 1 }} onClick={() => setStep(1)}>Taxes <ArrowRight size={15} /></Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Taxes ── */}
        {step === 1 && (
          <div className="glass-card rounded-2xl p-8">
            <h2 className="text-xl font-semibold text-charcoal-heading">Statutory Taxes</h2>
            <p className="mt-1 font-body-sm text-body-sm text-secondary">These employee-side statutory rates are applied automatically to each pay advice.</p>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[{ n: 'N.I.S', r: '3.0%' }, { n: 'N.H.T', r: '2.0%' }, { n: 'EDU. TAX', r: '2.25%' }].map((t) => (
                <div key={t.n} className="rounded-2xl border border-outline-variant/30 bg-surface-container-low px-6 py-12 text-center">
                  <div className="font-label-md text-label-md uppercase tracking-wider text-secondary">{t.n}</div>
                  <div className="mt-3 font-display text-5xl font-bold text-[#4F46E5] lg:text-6xl">{t.r}</div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={() => setStep(2)}>Review <ArrowRight size={15} /></Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Review ── */}
        {step === 2 && (
          <div className="glass-card rounded-2xl p-6">
            <div className="rounded-2xl p-6" style={{ background: 'linear-gradient(120deg,#EEF2FF,#F5F3FF)' }}>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Banner label="Payroll Cash Required" value={money(totals.gross)} />
                <Banner label="Payout Cash" value={money(totals.net)} big />
                <Banner label="Employees" value={String(employees.length)} />
                <Banner label="Payroll Date" value={fmtDate(new Date(payrollDate).toISOString())} />
              </div>
            </div>

            <button onClick={() => setShowTax((v) => !v)} className="mt-5 flex items-center gap-1.5 font-label-md text-label-md font-semibold text-primary">
              {showTax ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Taxes Collection {money(totals.taxes)}
            </button>
            {showTax && (
              <table className="mt-2 w-full border-collapse text-[13px]">
                <thead><tr className="border-b border-outline-variant/40 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary"><th className="px-3 py-2">Tax Code</th><th className="px-3 py-2">Percent</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
                <tbody>
                  {[['NIS', '3.0%', totals.nis], ['NHT', '2.0%', totals.nht], ['EDUTAX', '2.25%', totals.edTax], ['PAYE', '25%', totals.paye]].map(([n, p, v]) => (
                    <tr key={n as string} className="border-b border-surface-container-low"><td className="px-3 py-2 font-medium">{n}</td><td className="px-3 py-2 text-secondary">{p}</td><td className="px-3 py-2 text-right">{money(v as number)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="mt-6 font-label-md text-label-md font-semibold text-charcoal-heading">Pay advice breakdown</div>
            <div className="mt-2 overflow-x-auto rounded-xl border border-outline-variant/30">
              <table className="w-full border-collapse text-[13px]">
                <thead><tr className="border-b border-outline-variant/40 bg-surface-container-low/40 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary">
                  <th className="px-3 py-2">Employee</th><th className="px-3 py-2 text-right">Base</th><th className="px-3 py-2 text-right">Bonus</th><th className="px-3 py-2 text-right">Deductions</th><th className="px-3 py-2 text-right">Income Tax</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Net</th>
                </tr></thead>
                <tbody>
                  {employees.map((e) => {
                    const l = lineFor(e.id);
                    const c = previewAdvice({ basicPay: e.salary, commission: l.commission, bonus: l.bonus, pension: l.pension, reimbursement: l.reimbursement });
                    return (
                      <tr key={e.id} className="border-b border-surface-container-low">
                        <td className="px-3 py-2"><span className="font-semibold text-charcoal-heading">{e.user.firstName} {e.user.lastName}</span></td>
                        <td className="px-3 py-2 text-right">{money(e.salary)}</td>
                        <td className="px-3 py-2 text-right">{money(l.bonus)}</td>
                        <td className="px-3 py-2 text-right">{money(c.deductions)}</td>
                        <td className="px-3 py-2 text-right">{money(c.paye)}</td>
                        <td className="px-3 py-2 text-right">{money(c.grossPay)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-charcoal-heading">{money(c.netPay)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-surface-container-low/50 font-bold text-charcoal-heading">
                    <td className="px-3 py-2.5">Totals</td><td /><td /><td className="px-3 py-2.5 text-right">{money(totals.ded)}</td><td className="px-3 py-2.5 text-right">{money(totals.paye)}</td><td className="px-3 py-2.5 text-right">{money(totals.gross)}</td><td className="px-3 py-2.5 text-right">{money(totals.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button loading={process.isPending} disabled={process.isPending} style={{ opacity: process.isPending ? 0.6 : 1 }} onClick={() => process.mutate()}>Run Payroll</Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Finish & Approve ── */}
        {step === 3 && result && (
          <div className="glass-card relative rounded-2xl p-6">
            {approved && (
              <div className="absolute right-6 top-6 text-right no-print">
                <div className="font-label-sm text-label-sm text-secondary">Approved by {approved.approvedBy?.firstName} {approved.approvedBy?.lastName}</div>
                <div className="font-label-sm text-label-sm text-secondary">On {fmtDate(approved.approvedAt)}</div>
              </div>
            )}
            <div className="rounded-2xl border p-6" style={{ background: '#F0FDF4', borderColor: '#BBF7D0' }}>
              <div className="flex items-center gap-2" style={{ color: '#16A34A' }}><CheckCircle2 size={20} /><span className="font-headline-sm text-headline-sm">Payroll processed</span></div>
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
                <Banner label="Payout Cash" value={money(result.totalNet)} big />
                <Banner label="Employees" value={String(result.employeeCount)} />
                <Banner label="Payroll Date" value={fmtDate(result.payrollDate)} />
              </div>
            </div>

            <button onClick={() => setShowAdviceSummary((v) => !v)} className="mt-5 flex items-center gap-1.5 font-label-md text-label-md font-semibold text-primary">
              {showAdviceSummary ? <ChevronDown size={16} /> : <ChevronRight size={16} />} View Pay Advice Summary
            </button>
            {showAdviceSummary && (
              <table className="mt-2 w-full border-collapse text-[13px]">
                <thead><tr className="border-b border-outline-variant/40 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary"><th className="px-3 py-2">Employee</th><th className="px-3 py-2 text-right">Gross Pay</th><th className="px-3 py-2 text-right">Deductions</th><th className="px-3 py-2 text-right">Net Pay</th></tr></thead>
                <tbody>{result.payAdvices.map((a) => (
                  <tr key={a.id} className="border-b border-surface-container-low"><td className="px-3 py-2 font-semibold text-charcoal-heading">{a.employee.user.firstName} {a.employee.user.lastName}</td><td className="px-3 py-2 text-right">{money(a.grossPay)}</td><td className="px-3 py-2 text-right">{money(a.grossPay - a.netPay)}</td><td className="px-3 py-2 text-right font-semibold">{money(a.netPay)}</td></tr>
                ))}</tbody>
              </table>
            )}

            <button onClick={() => setShowTaxCollected((v) => !v)} className="mt-4 flex items-center gap-1.5 font-label-md text-label-md font-semibold text-primary">
              {showTaxCollected ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Taxes Collected
            </button>
            {showTaxCollected && (
              <table className="mt-2 w-full border-collapse text-[13px]">
                <thead><tr className="border-b border-outline-variant/40 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary"><th className="px-3 py-2">Tax</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
                <tbody>
                  {[['NIS', result.payAdvices.reduce((s, a) => s + a.nis, 0)], ['NHT', result.payAdvices.reduce((s, a) => s + a.nht, 0)], ['EDTAX', result.payAdvices.reduce((s, a) => s + a.edTax, 0)], ['PAYE', result.payAdvices.reduce((s, a) => s + a.paye, 0)]].map(([n, v]) => (
                    <tr key={n as string} className="border-b border-surface-container-low"><td className="px-3 py-2 font-medium">{n}</td><td className="px-3 py-2 text-right">{money(v as number)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="mt-6 flex items-center justify-between">
              <Button variant="secondary" onClick={() => router.push(`/payroll/run/${result.id}`)}>Open Payroll Report</Button>
              {approved ? (
                <span className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-label-md text-label-md font-semibold" style={{ background: '#F0FDF4', color: '#16A34A' }}><CheckCircle2 size={16} /> Approved</span>
              ) : (
                <Button loading={approve.isPending} icon={<ShieldCheck size={16} />} disabled={approve.isPending} style={{ opacity: approve.isPending ? 0.6 : 1 }} onClick={() => approve.mutate()}>Approve</Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inp = 'h-11 rounded-xl border border-outline-variant/40 bg-white px-3.5 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary';
const miniInp = 'h-7 w-16 rounded-lg border border-outline-variant/40 bg-white px-2 text-[12px] text-on-surface outline-none focus:border-primary';

function Banner({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">{label}</div>
      <div className={`font-display font-bold leading-none text-[#0F172A] ${big ? 'text-4xl lg:text-5xl' : 'text-2xl lg:text-3xl'}`}>{value}</div>
    </div>
  );
}

// A compact JMD input; when `minus` the empty/zero state reads "– $0.00" in slate (never orange).
function MoneyInput({ label, value, onChange, minus }: { label: string; value: number; onChange: (cents: number) => void; minus?: boolean }) {
  return (
    <label className="flex items-center justify-end gap-1.5">
      <span className="text-[11px] text-slate-500">{minus ? '–' : ''} {label}</span>
      <div className="flex items-center rounded-lg border border-outline-variant/40 bg-white pl-1.5">
        <span className={`text-[11px] ${value ? 'text-secondary' : 'text-slate-500'}`}>$</span>
        <input type="number" min="0" value={fromC(value)} onChange={(e) => onChange(toC(e.target.value))} placeholder="0.00"
          className="h-7 w-20 bg-transparent px-1 text-right text-[12px] text-on-surface outline-none placeholder:text-slate-500" />
      </div>
    </label>
  );
}
