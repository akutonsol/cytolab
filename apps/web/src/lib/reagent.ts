// Shared types + display metadata for Reagent / Stain Lot Tracking.
// Zero orange — amber (#B45309, detector-safe) is allowed for expiry warnings.

export type ReagentStatus = 'Active' | 'Quarantined' | 'Depleted' | 'Expired' | 'Recalled';

export interface ReagentLot {
  id: string; name: string; manufacturer: string | null; catalogNumber: string | null; lotNumber: string;
  expiryDate: string | null; receivedDate: string; openedDate: string | null; status: ReagentStatus;
  quantity: number | null; unit: string | null; storageTemp: string | null; notes: string | null;
  createdAt: string; usageCount: number; createdByName: string | null;
}

export interface ReagentUsage {
  id: string; batchId: string | null; quantityUsed: number | null; usedAt: string; notes: string | null;
  usedBy: { firstName: string; lastName: string } | null;
  record: { id: string; labNumber: string | null; identifier: string } | null;
}
export interface ReagentDetail extends ReagentLot { usages: ReagentUsage[] }

export interface ReagentStats {
  totalActive: number; expiringSoon: number; quarantined: number; usagesThisMonth: number;
  mostUsedReagent: { name: string; usageCount: number } | null;
  recentUsages: { id: string; reagentName: string; lotNumber: string; usedBy: string; recordNo: string | null; usedAt: string }[];
}

export interface AffectedRecords { count: number; records: { recordId: string; labNo: string; status: string; patientName: string; usedAt: string; batchId: string | null }[] }

export const STATUS_META: Record<ReagentStatus, { label: string; bg: string; fg: string; rowBg?: string }> = {
  Active: { label: 'Active', bg: '#DCFCE7', fg: '#16A34A' },
  Quarantined: { label: 'Quarantined', bg: '#FEE2E2', fg: '#B91C1C', rowBg: '#FEF2F2' },
  Depleted: { label: 'Depleted', bg: '#F1F5F9', fg: '#475569' },
  Expired: { label: 'Expired', bg: '#F1F5F9', fg: '#475569' },
  Recalled: { label: 'Recalled', bg: '#FEE2E2', fg: '#B91C1C', rowBg: '#FEF2F2' },
};

export const REAGENT_STATUSES: ReagentStatus[] = ['Active', 'Quarantined', 'Depleted', 'Expired', 'Recalled'];

const DAY = 86_400_000;
/** Whole days until expiry (negative if already expired). */
export const daysUntil = (iso: string | null): number | null => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / DAY) : null);
export const isExpired = (iso: string | null): boolean => { const d = daysUntil(iso); return d !== null && d < 0; };
export const isExpiringSoon = (iso: string | null): boolean => { const d = daysUntil(iso); return d !== null && d >= 0 && d <= 30; };

/** Expiry text color: red if expired/≤7d, amber if ≤30d, slate otherwise. */
export function expiryColor(iso: string | null): string {
  const d = daysUntil(iso);
  if (d === null) return '#475569';
  if (d < 7) return '#B91C1C';
  if (d <= 30) return '#B45309'; // amber-700 (detector-safe)
  return '#475569';
}

export const shortDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const relTime = (iso: string): string => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
