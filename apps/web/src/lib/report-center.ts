// Report Center registry — config-driven so one generic runner renders all 14
// reports. Zero orange; chart palette uses indigo/blue/violet/teal/green/red.

export type ReportCategory = 'Specimen' | 'Clinical' | 'Financial' | 'Patient' | 'Staff' | 'Quality';
export type ValueFormat = 'number' | 'money' | 'percent' | 'days' | 'ratio' | 'date' | 'text';

export interface KpiConfig { label: string; path: string; format: ValueFormat }
export interface ChartConfig {
  type: 'line' | 'bar' | 'donut';
  dataPath: string;
  xKey?: string;
  nameKey?: string; // donut
  valueKey?: string; // donut
  series?: { key: string; name: string; color: string }[];
}
export interface TableConfig { rowsPath: string; columns: { key: string; label: string; format?: ValueFormat }[] }

export interface ReportDef {
  id: string;
  name: string;
  description: string;
  category: ReportCategory;
  endpoint: string;
  recommended?: boolean;
  filters?: ('client' | 'user')[];
  kpis?: KpiConfig[];
  chart?: ChartConfig;
  table?: TableConfig;
}

export const CHART = { indigo: '#4F46E5', blue: '#3B82F6', violet: '#7C3AED', teal: '#0D9488', green: '#16A34A', red: '#DC2626', amber: '#B45309', slate: '#64748B' };
const DONUT_COLORS = [CHART.indigo, CHART.blue, CHART.violet, CHART.teal, CHART.green, CHART.amber, CHART.slate, '#DB2777'];
export const donutColor = (i: number) => DONUT_COLORS[i % DONUT_COLORS.length];

export const CATEGORIES: ReportCategory[] = ['Specimen', 'Clinical', 'Financial', 'Patient', 'Staff', 'Quality'];

export const REPORTS: ReportDef[] = [
  // ── Specimen ──────────────────────────────────────────────────────────────
  {
    id: 'specimen-volume', name: 'Specimen Volume', category: 'Specimen', endpoint: '/report-center/specimen-volume',
    description: 'Monthly specimen counts by form type with growth vs the prior period.', recommended: true, filters: ['client'],
    kpis: [
      { label: 'Total Specimens', path: 'total', format: 'number' },
      { label: 'GYN', path: 'gynCount', format: 'number' },
      { label: 'Non-GYN', path: 'nonGynCount', format: 'number' },
      { label: 'Growth', path: 'growthRate', format: 'percent' },
    ],
    chart: { type: 'line', dataPath: 'byMonth', xKey: 'month', series: [{ key: 'total', name: 'Total', color: CHART.indigo }, { key: 'gyn', name: 'GYN', color: CHART.blue }, { key: 'nonGyn', name: 'Non-GYN', color: CHART.violet }] },
    table: { rowsPath: 'bySpecimenType', columns: [{ key: 'type', label: 'Specimen Type' }, { key: 'count', label: 'Count', format: 'number' }, { key: 'percentage', label: 'Share', format: 'percent' }] },
  },
  {
    id: 'tat-analysis', name: 'TAT Analysis', category: 'Specimen', endpoint: '/report-center/tat-analysis',
    description: 'Turnaround time performance — average, median, on-time and breach rates.', recommended: true,
    kpis: [
      { label: 'Avg TAT', path: 'avgTAT', format: 'days' },
      { label: 'Median TAT', path: 'medianTAT', format: 'days' },
      { label: 'On-Time', path: 'onTimeRate', format: 'percent' },
      { label: 'Breach', path: 'breachRate', format: 'percent' },
    ],
    chart: { type: 'line', dataPath: 'trend', xKey: 'month', series: [{ key: 'avgHours', name: 'Avg Hours', color: CHART.indigo }, { key: 'breachCount', name: 'Breaches', color: CHART.red }] },
    table: { rowsPath: 'byPathologist', columns: [{ key: 'name', label: 'Pathologist' }, { key: 'avgHours', label: 'Avg Hours', format: 'number' }, { key: 'count', label: 'Cases', format: 'number' }] },
  },
  {
    id: 'specimen-distribution', name: 'Specimen Distribution', category: 'Specimen', endpoint: '/report-center/specimen-distribution',
    description: 'Specimen type breakdown with referring client and doctor mix.',
    kpis: [{ label: 'GYN Records', path: 'byFormType.gyn', format: 'number' }, { label: 'Non-GYN Records', path: 'byFormType.nonGyn', format: 'number' }],
    chart: { type: 'donut', dataPath: 'byType', nameKey: 'type', valueKey: 'count' },
    table: { rowsPath: 'byClient', columns: [{ key: 'client', label: 'Client' }, { key: 'count', label: 'Count', format: 'number' }, { key: 'percentage', label: 'Share', format: 'percent' }] },
  },
  // ── Clinical ──────────────────────────────────────────────────────────────
  {
    id: 'bethesda-trends', name: 'Bethesda Trends', category: 'Clinical', endpoint: '/report-center/bethesda-trends',
    description: 'Bethesda classification distribution and ASC:SIL ratio over time.', recommended: true,
    kpis: [
      { label: 'NILM Rate', path: 'nilmRate', format: 'percent' },
      { label: 'Abnormality Rate', path: 'abnormalityRate', format: 'percent' },
      { label: 'Unsatisfactory', path: 'unsatisfactoryRate', format: 'percent' },
      { label: 'ASC:SIL Ratio', path: 'ascSilRatio', format: 'ratio' },
    ],
    chart: { type: 'line', dataPath: 'byMonth', xKey: 'month', series: [{ key: 'nilm', name: 'NILM', color: CHART.green }, { key: 'ascus', name: 'ASC-US', color: CHART.blue }, { key: 'lsil', name: 'LSIL', color: CHART.violet }, { key: 'hsil', name: 'HSIL', color: CHART.red }, { key: 'unsat', name: 'Unsat', color: CHART.amber }] },
    table: { rowsPath: 'byMonth', columns: [{ key: 'month', label: 'Month' }, { key: 'nilm', label: 'NILM', format: 'number' }, { key: 'ascus', label: 'ASC-US', format: 'number' }, { key: 'lsil', label: 'LSIL', format: 'number' }, { key: 'hsil', label: 'HSIL', format: 'number' }, { key: 'scc', label: 'SCC', format: 'number' }, { key: 'unsat', label: 'Unsat', format: 'number' }] },
  },
  {
    id: 'abnormal-rate', name: 'Abnormal Result Rate', category: 'Clinical', endpoint: '/report-center/abnormal-rate',
    description: 'Abnormal detection rates and escalation outcomes.',
    kpis: [
      { label: 'Total Results', path: 'totalResults', format: 'number' },
      { label: 'Abnormal', path: 'abnormalCount', format: 'number' },
      { label: 'Abnormal Rate', path: 'abnormalRate', format: 'percent' },
      { label: 'Escalations', path: 'escalations.total', format: 'number' },
    ],
    chart: { type: 'line', dataPath: 'byMonth', xKey: 'month', series: [{ key: 'total', name: 'Total', color: CHART.indigo }, { key: 'abnormal', name: 'Abnormal', color: CHART.red }] },
    table: { rowsPath: 'byPathologist', columns: [{ key: 'name', label: 'Pathologist' }, { key: 'total', label: 'Total', format: 'number' }, { key: 'abnormal', label: 'Abnormal', format: 'number' }, { key: 'rate', label: 'Rate', format: 'percent' }] },
  },
  {
    id: 'cytotechnologist-performance', name: 'Cytotechnologist Performance', category: 'Clinical', endpoint: '/report-center/cytotechnologist-performance',
    description: 'Per-staff throughput, turnaround, detection, and quality score.', filters: ['user'],
    kpis: [{ label: 'Staff Members', path: 'staff.length', format: 'number' }],
    table: { rowsPath: 'staff', columns: [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'casesProcessed', label: 'Cases', format: 'number' }, { key: 'avgTAT', label: 'Avg TAT (d)', format: 'number' }, { key: 'onTimeRate', label: 'On-Time', format: 'percent' }, { key: 'abnormalDetectionRate', label: 'Abn. Detect', format: 'percent' }, { key: 'qualityScore', label: 'Quality', format: 'number' }] },
  },
  // ── Financial ─────────────────────────────────────────────────────────────
  {
    id: 'revenue-by-client', name: 'Revenue by Client', category: 'Financial', endpoint: '/report-center/revenue-by-client',
    description: 'Revenue, collections, and outstanding balance per referring client.', recommended: true, filters: ['client'],
    kpis: [
      { label: 'Total Revenue', path: 'totalRevenue', format: 'money' },
      { label: 'Collected', path: 'totalPaid', format: 'money' },
      { label: 'Outstanding', path: 'totalOutstanding', format: 'money' },
    ],
    chart: { type: 'line', dataPath: 'trend', xKey: 'month', series: [{ key: 'revenue', name: 'Revenue', color: CHART.indigo }, { key: 'collected', name: 'Collected', color: CHART.green }] },
    table: { rowsPath: 'byClient', columns: [{ key: 'clientName', label: 'Client' }, { key: 'invoiceCount', label: 'Invoices', format: 'number' }, { key: 'totalAmount', label: 'Total', format: 'money' }, { key: 'paidAmount', label: 'Paid', format: 'money' }, { key: 'outstandingAmount', label: 'Outstanding', format: 'money' }, { key: 'paymentRate', label: 'Paid %', format: 'percent' }] },
  },
  {
    id: 'services-revenue', name: 'Services Revenue', category: 'Financial', endpoint: '/report-center/services-revenue',
    description: 'Revenue by service line and form type.',
    kpis: [{ label: 'GYN Revenue', path: 'byFormType.gyn.revenue', format: 'money' }, { label: 'Non-GYN Revenue', path: 'byFormType.nonGyn.revenue', format: 'money' }],
    chart: { type: 'line', dataPath: 'trend', xKey: 'month', series: [{ key: 'revenue', name: 'Revenue', color: CHART.indigo }] },
    table: { rowsPath: 'byService', columns: [{ key: 'service', label: 'Service' }, { key: 'count', label: 'Count', format: 'number' }, { key: 'unitPrice', label: 'Unit Price', format: 'money' }, { key: 'total', label: 'Total', format: 'money' }] },
  },
  {
    id: 'outstanding-payments', name: 'Outstanding Payments', category: 'Financial', endpoint: '/report-center/outstanding-payments',
    description: 'Unpaid and overdue invoices with ageing.',
    kpis: [
      { label: 'Total Outstanding', path: 'totalOutstanding', format: 'money' },
      { label: 'Overdue Invoices', path: 'overdueCount', format: 'number' },
      { label: 'Avg Days Overdue', path: 'avgDaysOverdue', format: 'number' },
    ],
    table: { rowsPath: 'invoices', columns: [{ key: 'invoiceNo', label: 'Invoice #' }, { key: 'clientName', label: 'Client' }, { key: 'amount', label: 'Amount', format: 'money' }, { key: 'dueDate', label: 'Due', format: 'date' }, { key: 'daysOverdue', label: 'Days Overdue', format: 'number' }, { key: 'status', label: 'Status' }] },
  },
  // ── Patient ───────────────────────────────────────────────────────────────
  {
    id: 'patient-registration', name: 'Patient Registration', category: 'Patient', endpoint: '/report-center/patient-registration',
    description: 'Registration growth with gender and age-group breakdowns.', recommended: true,
    kpis: [
      { label: 'Total Patients', path: 'totalPatients', format: 'number' },
      { label: 'New This Period', path: 'newThisPeriod', format: 'number' },
      { label: 'Growth', path: 'growthRate', format: 'percent' },
    ],
    chart: { type: 'line', dataPath: 'byMonth', xKey: 'month', series: [{ key: 'newPatients', name: 'New', color: CHART.indigo }, { key: 'cumulative', name: 'Cumulative', color: CHART.violet }] },
    table: { rowsPath: 'byAgeGroup', columns: [{ key: 'range', label: 'Age Group' }, { key: 'count', label: 'Patients', format: 'number' }] },
  },
  {
    id: 'recall-compliance', name: 'Recall Compliance', category: 'Patient', endpoint: '/report-center/recall-compliance',
    description: 'Patient recall follow-up and compliance rates by diagnosis.',
    kpis: [
      { label: 'Total Recalls', path: 'totalRecalls', format: 'number' },
      { label: 'Completed', path: 'completed', format: 'number' },
      { label: 'Overdue', path: 'overdue', format: 'number' },
      { label: 'Compliance', path: 'complianceRate', format: 'percent' },
    ],
    chart: { type: 'donut', dataPath: 'byDiagnosis', nameKey: 'diagnosis', valueKey: 'total' },
    table: { rowsPath: 'byDiagnosis', columns: [{ key: 'diagnosis', label: 'Diagnosis' }, { key: 'total', label: 'Total', format: 'number' }, { key: 'completed', label: 'Completed', format: 'number' }, { key: 'rate', label: 'Rate', format: 'percent' }] },
  },
  // ── Staff ─────────────────────────────────────────────────────────────────
  {
    id: 'pay-advice-history', name: 'Pay Advice History', category: 'Staff', endpoint: '/report-center/pay-advice-history',
    description: 'Employee payroll history with gross, deductions, and net pay.',
    kpis: [
      { label: 'Gross', path: 'totals.gross', format: 'money' },
      { label: 'Deductions', path: 'totals.deductions', format: 'money' },
      { label: 'Net Pay', path: 'totals.net', format: 'money' },
    ],
    table: { rowsPath: 'employees', columns: [{ key: 'name', label: 'Employee' }, { key: 'employeeNo', label: 'Emp #' }, { key: 'department', label: 'Department' }, { key: 'period', label: 'Period' }, { key: 'grossPay', label: 'Gross', format: 'money' }, { key: 'totalDeductions', label: 'Deductions', format: 'money' }, { key: 'netPay', label: 'Net', format: 'money' }] },
  },
  // ── Quality ───────────────────────────────────────────────────────────────
  {
    id: 'qc-failures', name: 'QC Failures', category: 'Quality', endpoint: '/report-center/qc-failures',
    description: 'QC failure trends by check type and equipment.',
    kpis: [
      { label: 'Total Checks', path: 'totalChecks', format: 'number' },
      { label: 'Failures', path: 'failCount', format: 'number' },
      { label: 'Fail Rate', path: 'failRate', format: 'percent' },
      { label: 'Pass Rate', path: 'passRate', format: 'percent' },
    ],
    chart: { type: 'line', dataPath: 'trend', xKey: 'date', series: [{ key: 'pass', name: 'Pass', color: CHART.green }, { key: 'fail', name: 'Fail', color: CHART.red }] },
    table: { rowsPath: 'byType', columns: [{ key: 'type', label: 'Check Type' }, { key: 'pass', label: 'Pass', format: 'number' }, { key: 'fail', label: 'Fail', format: 'number' }, { key: 'rate', label: 'Fail Rate', format: 'percent' }] },
  },
  {
    id: 'cap-benchmarks', name: 'CAP Benchmarks', category: 'Quality', endpoint: '/report-center/cap-benchmarks',
    description: 'CAP/ISO compliance summary against benchmark targets.', recommended: true,
    // Rendered with a dedicated benchmark card layout in the runner.
  },
];

export const reportById = (id: string) => REPORTS.find((r) => r.id === id);

// ── Value access + formatting ────────────────────────────────────────────────
export function getPath(obj: any, path: string): any {
  if (obj == null) return undefined;
  return path.split('.').reduce((o, k) => {
    if (o == null) return undefined;
    if (k === 'length' && Array.isArray(o)) return o.length;
    return o[k];
  }, obj);
}

export function fmtValue(v: any, format?: ValueFormat): string {
  if (v == null || v === '') return '—';
  switch (format) {
    case 'money': return `$${(Number(v) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'percent': return `${v}%`;
    case 'days': return `${v}d`;
    case 'ratio': return `${v}:1`;
    case 'number': return Number(v).toLocaleString();
    case 'date': return new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    default: return String(v);
  }
}

/** Build a CSV string from a report's primary table config + data. */
export function toCsv(def: ReportDef, data: any): string {
  if (!def.table) return '';
  const rows: any[] = getPath(data, def.table.rowsPath) ?? [];
  const header = def.table.columns.map((c) => c.label);
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(',')];
  for (const r of rows) lines.push(def.table.columns.map((c) => esc(fmtValue(r[c.key], c.format === 'money' ? 'money' : c.format === 'date' ? 'date' : undefined))).join(','));
  return lines.join('\n');
}
