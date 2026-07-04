'use client';

import { Mail, Printer } from 'lucide-react';
import { money, moneyDash, monthYear, fmtDate, ytdNet, totalDeductions, type SlipData } from '@/lib/payroll';

/**
 * Employee payslip — print layout. Used standalone (/payroll/slip/[adviceId])
 * and stacked inside the payroll report's "View Pay Advice Slips" section.
 */
export function PayslipCard({ slip, showActions = false }: { slip: SlipData; showActions?: boolean }) {
  const emp = slip.employee;
  const fullName = `${emp.user.firstName} ${emp.user.lastName}`;
  const period = slip.payrollRun?.period ?? slip.period;
  const rate = emp.isFixedSalary ? 'Fixed' : (slip.hoursWorked > 0 ? money(Math.round(emp.salary / slip.hoursWorked)) : '—');

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[24px] font-bold text-[#0F172A]">Employee Payslip</h1>
          <p className="mt-1 text-[14px] text-[#64748B]">Pay period: {monthYear(period)}</p>
        </div>
        {showActions && (
          <div className="no-print flex items-center gap-2">
            <a href={`mailto:?subject=${encodeURIComponent(`Payslip — ${fullName} — ${monthYear(period)}`)}`}
              title="Email" className="grid h-9 w-9 place-items-center rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-[#F5F7FF] hover:text-[#4F46E5]"><Mail size={16} /></a>
            <button onClick={() => window.print()} title="Print" className="grid h-9 w-9 place-items-center rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-[#F5F7FF] hover:text-[#4F46E5]"><Printer size={16} /></button>
          </div>
        )}
      </div>

      {/* Info header */}
      <div className="mt-6 overflow-hidden rounded-lg border border-[#E2E8F0]" style={{ borderLeft: '4px solid #4F46E5' }}>
        <div className="grid grid-cols-4 border-b border-[#F1F5F9] text-[13px]">
          <Cell label="Company Name" value={slip.lab?.name ?? '—'} />
          <Cell label="Department" value={emp.department?.name ?? '—'} />
          <Cell label="Date" value={fmtDate(slip.payrollRun?.payrollDate)} span={2} />
        </div>
        <div className="grid grid-cols-4 text-[13px]">
          <Cell label="Employee" value={fullName} />
          <Cell label="Employee ID" value={emp.employeeNo} />
          <Cell label="NIS" value={emp.nis || '—'} />
          <Cell label="TRN" value={emp.trn || '—'} />
        </div>
      </div>

      {/* Body: earnings | deductions */}
      <div className="mt-6 grid grid-cols-1 gap-0 md:grid-cols-2">
        {/* Earnings */}
        <div className="md:pr-8">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#94A3B8]">Earnings</div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-left text-[11px] uppercase tracking-wider text-[#94A3B8]">
                <th className="py-2 font-medium">Description</th><th className="py-2 text-center font-medium">Units</th>
                <th className="py-2 text-center font-medium">Rate</th><th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              <Earn desc="BONUS" units="-" rate="-" amount={moneyDash(slip.bonus)} />
              <Earn desc="COMMISSION" units="-" rate="-" amount={moneyDash(slip.commission)} />
              <Earn desc="BASEWAGE" units={String(slip.hoursWorked || 1)} rate={rate} amount={money(slip.basicPay)} />
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#0F172A]">
                <td className="py-2.5 font-bold text-[#0F172A]" colSpan={3}>Gross Earnings</td>
                <td className="py-2.5 text-right font-bold text-[#0F172A]">{money(slip.grossPay)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Deductions (vertical divider on md+) */}
        <div className="mt-8 border-t border-[#E2E8F0] pt-6 md:mt-0 md:border-l md:border-t-0 md:pl-8 md:pt-0">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#94A3B8]">Deductions</div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-left text-[11px] uppercase tracking-wider text-[#94A3B8]">
                <th className="py-2 font-medium">Description</th><th className="py-2 text-center font-medium">Percent</th><th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              <Ded desc="PENSION" pct="-" amount={moneyDash(slip.pension)} />
              <Ded desc="REIMBURSEMENT" pct="-" amount={moneyDash(slip.reimbursement)} />
              <Ded desc="NIS" pct="3.0%" amount={money(slip.nis)} />
              <Ded desc="NHT" pct="2.0%" amount={money(slip.nht)} />
              <Ded desc="EDUTAX" pct="2.25%" amount={money(slip.edTax)} />
            </tbody>
            <tfoot>
              <tr className="border-t border-[#E2E8F0]">
                <td className="py-2.5 font-semibold text-[#0F172A]" colSpan={2}>Total Deductions</td>
                <td className="py-2.5 text-right font-semibold text-[#0F172A]">{money(totalDeductions(slip))}</td>
              </tr>
              <tr className="border-t-2 border-[#0F172A]">
                <td className="py-3 text-[16px] font-bold text-[#0F172A]" colSpan={2}>NET PAY</td>
                <td className="py-3 text-right text-[18px] font-bold text-[#0F172A]">{money(slip.netPay)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* YTD strip */}
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#E2E8F0] text-center md:grid-cols-9" style={{ background: '#E2E8F0' }}>
        <div className="bg-[#F1F5F9] p-3 text-left">
          <div className="text-[12px] font-bold uppercase tracking-wider text-[#0F172A]">Year<br />to Date</div>
        </div>
        <Ytd label="Gross Taxable Income" value={money(slip.ytdGross)} />
        <Ytd label="Income Tax" value={money(slip.ytdPaye)} />
        <Ytd label="N.H.T" value={money(slip.ytdNht)} />
        <Ytd label="Education Tax" value={money(slip.ytdEdTax)} />
        <Ytd label="NIS" value={money(slip.ytdNis)} />
        <Ytd label="Pension" value={money(slip.ytdPension)} />
        <Ytd label="Loan Balance" value={money(slip.ytdLoanBalance)} />
        <Ytd label="Net (YTD)" value={money(ytdNet(slip))} />
      </div>
    </div>
  );
}

function Cell({ label, value, span }: { label: string; value: string; span?: number }) {
  return (
    <div className={`border-r border-[#F1F5F9] px-3 py-2.5 last:border-r-0 ${span === 2 ? 'col-span-2' : ''}`}>
      <div className="text-[10px] uppercase tracking-wider text-[#94A3B8]">{label}</div>
      <div className="mt-0.5 font-medium text-[#0F172A]">{value}</div>
    </div>
  );
}
function Earn({ desc, units, rate, amount }: { desc: string; units: string; rate: string; amount: string }) {
  return (
    <tr className="border-b border-[#F1F5F9]">
      <td className="py-2 font-medium text-[#334155]">{desc}</td>
      <td className="py-2 text-center text-[#64748B]">{units}</td>
      <td className="py-2 text-center text-[#64748B]">{rate}</td>
      <td className="py-2 text-right text-[#0F172A]">{amount}</td>
    </tr>
  );
}
function Ded({ desc, pct, amount }: { desc: string; pct: string; amount: string }) {
  return (
    <tr className="border-b border-[#F1F5F9]">
      <td className="py-2 font-medium text-[#334155]">{desc}</td>
      <td className="py-2 text-center text-[#64748B]">{pct}</td>
      <td className="py-2 text-right text-[#0F172A]">{amount}</td>
    </tr>
  );
}
function Ytd({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-3">
      <div className="text-[9px] uppercase leading-tight tracking-wider text-[#94A3B8]">{label}</div>
      <div className="mt-1 text-[12px] font-semibold text-[#0F172A]">{value}</div>
    </div>
  );
}
