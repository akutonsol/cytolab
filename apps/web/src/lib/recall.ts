// Shared types + display metadata for Patient Recall Management.
// Zero orange — var(--color-warning) (#A16207) is allowed for "due" warnings.

export type RecallStatus = 'Pending' | 'Due' | 'Overdue' | 'Completed' | 'Cancelled' | 'Declined';

export interface Recall {
  id: string; triggerDiagnosis: string; triggerDate: string; recallIntervalMonths: number; dueDate: string;
  status: RecallStatus; reminderSentAt: string | null; completedAt: string | null; completedRecordId: string | null;
  clientNotifiedAt: string | null; clientId: string | null; notes: string | null; createdAt: string;
  patient: { id: string; firstName: string; lastName: string; dateOfBirth: string | null; registrationNo: string | null } | null;
  triggerRecord: { id: string; labNumber: string | null; identifier: string } | null;
  patientName: string; labNo: string; clientName: string; daysUntilDue: number;
}

export interface RecallSummary { pending: number; due: number; overdue: number; completedThisMonth: number; overdueRate: number }

export interface RecallListRow { patientName: string; dob: string | null; lastResult: string; dueDate: string; clientName: string; daysPastDue: number | null; status: RecallStatus }

export const STATUS_META: Record<RecallStatus, { label: string; bg: string; fg: string; rowBg?: string }> = {
  Pending: { label: 'Pending', bg: '#F1F5F9', fg: '#475569' },
  Due: { label: 'Due', bg: '#FFFBEB', fg: 'var(--color-warning)', rowBg: '#FFFBEB' }, // amber (not orange)
  Overdue: { label: 'Overdue', bg: '#FEE2E2', fg: '#B91C1C', rowBg: '#FEF2F2' },
  Completed: { label: 'Completed', bg: '#DCFCE7', fg: '#16A34A' },
  Cancelled: { label: 'Cancelled', bg: '#F1F5F9', fg: '#475569' },
  Declined: { label: 'Declined', bg: '#F1F5F9', fg: '#475569' },
};

export const RECALL_STATUSES: RecallStatus[] = ['Pending', 'Due', 'Overdue', 'Completed', 'Cancelled', 'Declined'];
export const FILTER_TABS: (RecallStatus | 'all')[] = ['all', 'Pending', 'Due', 'Overdue', 'Completed'];

/** Due-date text color: red if past due, amber if <30 days, slate otherwise. */
export function dueColor(days: number): string {
  if (days < 0) return '#B91C1C';
  if (days <= 30) return 'var(--color-warning)';
  return '#475569';
}

export const shortDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const patientName = (r: Recall): string => r.patientName;
/** "in 12 days" / "5 days overdue". */
export function dueLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'due today';
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
