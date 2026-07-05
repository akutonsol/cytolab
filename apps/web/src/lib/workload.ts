// Shared types + display helpers for Case Assignment & Workload Balancing.

export type TatPriority = 'Stat' | 'Urgent' | 'Priority' | 'Routine';

export interface WorkloadUser {
  userId: string;
  userName: string;
  avatarInitials: string;
  role: string;
  assignedTotal: number;
  authorizedToday: number;
  authorizedThisWeek: number;
  dailyTarget: number;
  weeklyTarget: number;
  dailyProgress: number;
  weeklyProgress: number;
  oldestCase: string | null;
  tatBreachCount: number;
}

export interface QueueRecord {
  id: string;
  labNumber: string | null;
  identifier: string;
  formType: string | null;
  status: string;
  urgent: boolean;
  specimenDate: string | null;
  createdAt: string;
  assignedAt: string | null;
  tatPriority: TatPriority;
  hoursElapsed: number;
  patientName: string;
  specimenType: string | null;
}

export interface AssignmentHistoryRow {
  recordId: string;
  labNumber: string;
  patientName: string;
  assignedTo: string;
  assignedBy: string;
  assignedAt: string;
}

// TAT priority badge palette. Detector-safe: Priority uses dark yellow #A16207
// (not orange); Stat/Urgent use reds; Routine slate. Zero orange.
export const PRIORITY_META: Record<TatPriority, { label: string; bg: string; fg: string; rank: number }> = {
  Stat: { label: 'Stat', bg: '#FEE2E2', fg: '#B91C1C', rank: 3 },
  Urgent: { label: 'Urgent', bg: '#FEF2F2', fg: '#EF4444', rank: 2 },
  Priority: { label: 'Priority', bg: '#FEFCE8', fg: '#A16207', rank: 1 },
  Routine: { label: 'Routine', bg: '#F1F5F9', fg: '#475569', rank: 0 },
};

// Deterministic avatar colour from a name hash (indigo/blue/violet/teal/green).
const AVATAR_PALETTE = [
  { bg: '#EEF2FF', fg: '#4F46E5' }, // indigo
  { bg: '#EFF6FF', fg: '#2563EB' }, // blue
  { bg: '#F5F3FF', fg: '#7C3AED' }, // violet
  { bg: '#F0FDFA', fg: '#0D9488' }, // teal
  { bg: '#F0FDF4', fg: '#16A34A' }, // green
];
export function avatarColor(name: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

// Progress-bar fill: green ≥100% of target, bright yellow 50-99%, slate <50%.
// (#FACC15 has g=204 → outside the orange detector band; detector-safe.)
export function progressColor(ratio: number): string {
  if (ratio >= 1) return '#16A34A';
  if (ratio >= 0.5) return '#FACC15';
  return '#475569';
}
