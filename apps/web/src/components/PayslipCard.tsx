'use client';

import { Mail, Printer } from 'lucide-react';
import { money, moneyDash, monthYear, ytdNet, totalDeductions, type SlipData } from '@/lib/payroll';

const INDIGO = '#4F46E5';
// "Oct 09, 2023"
const slipDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—');

/**
 * Employee payslip — legacy table layout (no cards/grids). Used standalone
 * (/payroll/slip/[adviceId]) and stacked inside the payroll report.
 */
export function PayslipCard({ slip, showActions = false }: { slip: SlipData; showActions?: boolean }) {
  const emp = slip.employee;
  const fullName = `${emp.user.firstName} ${emp.user.lastName}`;
  const period = slip.payrollRun?.period ?? slip.period;
  const rate = emp.isFixedSalary ? 'Fixed' : slip.hoursWorked > 0 ? money(Math.round(emp.salary / slip.hoursWorked)) : '—';

  return (
    <div className="bg-white p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[24px] font-bold text-slate-900">Employee Payslip</h1>
          <p className="mt-1 text-[14px] text-slate-500">Pay period: {monthYear(period)}</p>
        </div>
        {showActions && (
          <div className="no-print flex items-center gap-2">
            <a href={`mailto:?subject=${encodeURIComponent(`Payslip — ${fullName} — ${monthYear(period)}`)}`}
              title="Email" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-[#F5F7FF] hover:text-[#4F46E5]"><Mail size={16} /></a>
            <button onClick={() => window.print()} title="Print" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-[#F5F7FF] hover:text-[#4F46E5]"><Printer size={16} /></button>
          </div>
        )}
      </div>

      {/* ── Info header table ── */}
      <table className="w-full border-collapse text-sm" style={{ border: '1px solid #E2E8F0', borderTop: `3px solid ${INDIGO}` }}>
        <tbody>
          <tr>
            <InfoCell label="Company Name" value={slip.lab?.name ?? '—'} className="border-b border-r border-slate-200" />
            <InfoCell label="Department" value={emp.department?.name ?? '—'} className="border-b border-r border-slate-200" />
            <InfoCell label="Date" value={slipDate(slip.payrollRun?.payrollDate)} colSpan={2} className="border-b border-slate-200" />
          </tr>
          <tr>
            <InfoCell label="Employee" value={fullName} className="border-r border-slate-200" />
            <InfoCell label="Employee ID" value={emp.employeeNo} className="border-r border-slate-200" />
            <InfoCell label="NIS" value={emp.nis || '—'} className="border-r border-slate-200" />
            <InfoCell label="TRN" value={emp.trn || '—'} />
          </tr>
        </tbody>
      </table>

      {/* ── Earnings | Deductions (single unified table, vertical divider) ── */}
      <table className="mt-4 w-full border-collapse border border-slate-200 text-sm">
        <tbody>
          {/* Section headers */}
          <tr>
            <td colSpan={4} className="bg-slate-50 px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400">Earnings</td>
            <td colSpan={3} className="border-l border-slate-200 bg-slate-50 px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400">Deductions</td>
          </tr>
          {/* Column headers */}
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2 text-left font-medium">Description</th>
            <th className="px-3 py-2 text-center font-medium">Units</th>
            <th className="px-3 py-2 text-center font-medium">Rate</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="border-l border-slate-200 px-3 py-2 text-left font-medium">Description</th>
            <th className="px-3 py-2 text-center font-medium">Percent</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
          </tr>
          {/* Row 1 */}
          <tr>
            <RowLabel>BONUS</RowLabel><Mid>-</Mid><Mid>-</Mid><Amt>{moneyDash(slip.bonus)}</Amt>
            <RowLabel divider>PENSION</RowLabel><Mid>-</Mid><Amt>{moneyDash(slip.pension)}</Amt>
          </tr>
          {/* Row 2 */}
          <tr>
            <RowLabel>COMMISSION</RowLabel><Mid>-</Mid><Mid>-</Mid><Amt>{moneyDash(slip.commission)}</Amt>
            <RowLabel divider>REIMBURSEMENT</RowLabel><Mid>-</Mid><Amt>{moneyDash(slip.reimbursement)}</Amt>
          </tr>
          {/* Row 3 */}
          <tr>
            <RowLabel>BASEWAGE</RowLabel><Mid>{slip.hoursWorked || 1}</Mid><Mid>{rate}</Mid><Amt>{money(slip.basicPay)}</Amt>
            <RowLabel divider>NIS</RowLabel><Mid>3.0%</Mid><Amt>{money(slip.nis)}</Amt>
          </tr>
          {/* Row 4 (spacer left) */}
          <tr>
            <td colSpan={4} className="px-3 py-3">&nbsp;</td>
            <RowLabel divider>NHT</RowLabel><Mid>2.0%</Mid><Amt>{money(slip.nht)}</Amt>
          </tr>
          {/* Row 5 (spacer left) */}
          <tr>
            <td colSpan={4} className="px-3 py-3">&nbsp;</td>
            <RowLabel divider>EDUTAX</RowLabel><Mid>2.25%</Mid><Amt>{money(slip.edTax)}</Amt>
          </tr>
          {/* Footer 1: Gross Earnings | Total Deductions */}
          <tr className="bg-slate-50">
            <td colSpan={3} className="px-3 py-2.5 font-bold text-slate-900">Gross Earnings</td>
            <td className="px-3 py-2.5 text-right font-bold text-slate-900">{money(slip.grossPay)}</td>
            <td colSpan={2} className="border-l border-slate-200 px-3 py-2.5 font-bold text-slate-900">Total Deductions</td>
            <td className="px-3 py-2.5 text-right font-bold text-slate-900">{money(totalDeductions(slip))}</td>
          </tr>
          {/* Footer 2: NET PAY */}
          <tr className="bg-slate-50">
            <td colSpan={4} className="px-3 py-3">&nbsp;</td>
            <td colSpan={2} className="border-l border-slate-200 px-3 py-3 text-[20px] font-bold text-slate-900">NET PAY</td>
            <td className="px-3 py-3 text-right text-[20px] font-bold text-slate-900">{money(slip.netPay)}</td>
          </tr>
        </tbody>
      </table>

      {/* ── YTD strip ── */}
      <table className="mt-4 w-full border-collapse border border-slate-200 text-sm">
        <tbody>
          <tr>
            <td rowSpan={2} className="w-[90px] border border-slate-200 bg-slate-100 px-4 text-center align-middle">
              <div className="text-[12px] font-bold uppercase leading-tight tracking-wider text-slate-700">Year<br />to Date</div>
            </td>
            <Ytd label="Gross Taxable Income" value={money(slip.ytdGross)} />
            <Ytd label="Income Tax" value={money(slip.ytdPaye)} />
            <Ytd label="N.H.T" value={money(slip.ytdNht)} colSpan={2} />
            <td rowSpan={2} className="border border-slate-200 bg-slate-50 px-4 text-right align-middle">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Net (YTD)</div>
              <div className="mt-1 text-[18px] font-bold text-slate-900">{money(ytdNet(slip))}</div>
            </td>
          </tr>
          <tr>
            <Ytd label="Education Tax" value={money(slip.ytdEdTax)} />
            <Ytd label="NIS" value={money(slip.ytdNis)} />
            <Ytd label="Pension" value={money(slip.ytdPension)} />
            <Ytd label="Loan Balance" value={money(slip.ytdLoanBalance)} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function InfoCell({ label, value, colSpan, className = '' }: { label: string; value: string; colSpan?: number; className?: string }) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3 ${className}`}>
      <span className="text-slate-500">{label} : </span>
      <span className="text-slate-900">{value}</span>
    </td>
  );
}
function RowLabel({ children, divider }: { children: React.ReactNode; divider?: boolean }) {
  return <td className={`px-3 py-2 font-medium ${divider ? 'border-l border-slate-200' : ''}`} style={{ color: INDIGO }}>{children}</td>;
}
function Mid({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-center text-slate-500">{children}</td>;
}
function Amt({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-right text-slate-900">{children}</td>;
}
function Ytd({ label, value, colSpan }: { label: string; value: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className="border border-slate-200 bg-slate-50 px-3 py-2.5 align-top">
      <div className="text-[10px] uppercase leading-tight tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </td>
  );
}
