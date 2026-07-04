// Shared payroll types + formatting helpers. All money is minor units (cents).

export type RunStatus = 'Draft' | 'Processing' | 'Completed';
export type AdviceStatus = 'Draft' | 'Issued' | 'Paid';

export interface Advice {
  id: string;
  period: string;
  hoursWorked: number;
  basicPay: number; overtime: number; allowances: number; commission: number; bonus: number; grossPay: number;
  nis: number; nht: number; edTax: number; paye: number; pension: number; reimbursement: number; otherDeductions: number; netPay: number;
  ytdGross: number; ytdNis: number; ytdNht: number; ytdEdTax: number; ytdPaye: number; ytdPension: number; ytdLoanBalance: number;
  status: AdviceStatus; employeeId: string; payrollRunId: string | null;
  employee: {
    id: string; employeeNo: string; jobTitle: string; isFixedSalary: boolean; salary: number;
    nis: string | null; trn: string | null;
    user: { firstName: string; lastName: string };
    department: { name: string } | null;
  };
}

export interface Run {
  id: string; period: string; status: RunStatus; runNumber: number; payrollDate: string | null;
  totalGross: number; totalDeductions: number; totalNet: number; employeeCount: number;
  integrityHash: string | null; processedAt: string | null; approvedAt: string | null; approvalNotes: string | null;
  processedBy: { id: string; firstName: string; lastName: string } | null;
  approvedBy: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
}
export interface RunDetail extends Run {
  payAdvices: Advice[];
  lab?: { name: string; address: string | null; phone: string | null } | null;
}

export interface SlipData extends Advice {
  payrollRun: { period: string; payrollDate: string | null; runNumber: number } | null;
  lab: { name: string; address: string | null; phone: string | null } | null;
}

// $1,234.56 — used on payslips/receipts.
export const money = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Same, but a dash when zero (empty earnings/deductions).
export const moneyDash = (cents: number) => (cents > 0 ? money(cents) : '-');
// J$1,234 — compact for list/KPI displays.
export const jmd = (cents: number) => 'J$' + Math.round(cents / 100).toLocaleString('en-US');

export const monthYear = (period: string) => {
  const [y, m] = period.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
export const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export const ytdNet = (a: Advice) => a.ytdGross - a.ytdNis - a.ytdNht - a.ytdEdTax - a.ytdPaye - a.ytdPension;
export const totalDeductions = (a: Advice) => a.grossPay - a.netPay;

// Client mirror of the server's statutory calculator (payroll.service.ts) — used
// only for the wizard's live review preview; the persisted numbers come from the
// server on "Run Payroll". Keep the constants in sync with the backend.
const NIS_RATE = 0.03, NIS_CEILING = 41_666_667, NHT_RATE = 0.02, EDTAX_RATE = 0.0225;
const PAYE_THRESHOLD = 14_167_400, PAYE_HIGHER = 50_000_000, PAYE_R1 = 0.25, PAYE_R2 = 0.3;
export interface EarnInput { basicPay: number; commission?: number; bonus?: number; pension?: number; reimbursement?: number; otherDeductions?: number }
export function previewAdvice(i: EarnInput) {
  const grossPay = i.basicPay + (i.commission ?? 0) + (i.bonus ?? 0);
  const nis = Math.round(Math.min(grossPay, NIS_CEILING) * NIS_RATE);
  const nht = Math.round(grossPay * NHT_RATE);
  const statutory = grossPay - nis;
  const edTax = Math.round(statutory * EDTAX_RATE);
  let paye = 0;
  if (statutory > PAYE_THRESHOLD) {
    const b1 = Math.min(statutory, PAYE_HIGHER) - PAYE_THRESHOLD;
    paye = b1 * PAYE_R1;
    if (statutory > PAYE_HIGHER) paye += (statutory - PAYE_HIGHER) * PAYE_R2;
    paye = Math.round(paye);
  }
  const deductions = nis + nht + edTax + paye + (i.pension ?? 0) + (i.reimbursement ?? 0) + (i.otherDeductions ?? 0);
  return { grossPay, nis, nht, edTax, paye, deductions, netPay: grossPay - deductions };
}
