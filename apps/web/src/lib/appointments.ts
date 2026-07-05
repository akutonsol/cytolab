// Shared types + display metadata for Appointments. Zero orange — RecallVisit
// and Rescheduled use detector-safe amber (#B45309).

export type AppointmentType = 'SpecimenCollection' | 'FollowUp' | 'RecallVisit' | 'Consultation' | 'Other';
export type AppointmentStatus = 'Scheduled' | 'Confirmed' | 'CheckedIn' | 'Completed' | 'NoShow' | 'Cancelled' | 'Rescheduled';

export interface Appointment {
  id: string;
  type: string;
  status: string;
  scheduledAt: string;
  duration: number;
  location: string | null;
  doctorName: string | null;
  notes: string | null;
  checkedInAt: string | null;
  completedAt: string | null;
  resultRecordId: string | null;
  noShowAt: string | null;
  cancellationReason: string | null;
  reminderSentAt: string | null;
  recallRecordId: string | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string; registrationNo: string | null; phoneNumber: string | null } | null;
  client: { id: string; firstName: string; lastName: string; officeName: string | null } | null;
  assignedUser: { id: string; firstName: string; lastName: string } | null;
  patientName: string;
  clientName: string | null;
  assignedToName: string | null;
}

export interface AppointmentStats {
  todayCount: number;
  upcomingCount: number;
  noShowRate: number;
  completionRate: number;
  byType: { type: string; count: number }[];
}

// Legacy enum values (pre-existing rows) mapped onto the spec set for display.
const LEGACY_TYPE: Record<string, AppointmentType> = { COLLECTION: 'SpecimenCollection', CALLBACK: 'FollowUp', CONSULTATION: 'Consultation', FOLLOWUP: 'FollowUp' };
const LEGACY_STATUS: Record<string, AppointmentStatus> = { SCHEDULED: 'Scheduled', CONFIRMED: 'Confirmed', IN_PROGRESS: 'CheckedIn', COMPLETED: 'Completed', MISSED: 'NoShow', CANCELLED: 'Cancelled' };
export const normType = (t: string): AppointmentType => (LEGACY_TYPE[t] ?? (t as AppointmentType));
export const normStatus = (s: string): AppointmentStatus => (LEGACY_STATUS[s] ?? (s as AppointmentStatus));

export const TYPE_META: Record<AppointmentType, { label: string; color: string; bg: string }> = {
  SpecimenCollection: { label: 'Specimen Collection', color: '#4F46E5', bg: '#EEF2FF' },
  FollowUp: { label: 'Follow-Up', color: '#1D4ED8', bg: '#DBEAFE' },
  RecallVisit: { label: 'Recall Visit', color: '#B45309', bg: '#FFFBEB' }, // amber, not orange
  Consultation: { label: 'Consultation', color: '#6D28D9', bg: '#EDE9FE' },
  Other: { label: 'Other', color: '#475569', bg: '#F1F5F9' },
};

export const STATUS_META: Record<AppointmentStatus, { label: string; fg: string; bg: string; strike?: boolean }> = {
  Scheduled: { label: 'Scheduled', fg: '#64748B', bg: '#F1F5F9' },
  Confirmed: { label: 'Confirmed', fg: '#4F46E5', bg: '#EEF2FF' },
  CheckedIn: { label: 'Checked In', fg: '#1D4ED8', bg: '#DBEAFE' },
  Completed: { label: 'Completed', fg: '#16A34A', bg: '#DCFCE7' },
  NoShow: { label: 'No Show', fg: '#B91C1C', bg: '#FEE2E2' },
  Cancelled: { label: 'Cancelled', fg: '#94A3B8', bg: '#F1F5F9', strike: true },
  Rescheduled: { label: 'Rescheduled', fg: '#B45309', bg: '#FFFBEB' }, // amber, not orange
};

export const APPT_TYPES: AppointmentType[] = ['SpecimenCollection', 'FollowUp', 'RecallVisit', 'Consultation', 'Other'];

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
export const longDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
