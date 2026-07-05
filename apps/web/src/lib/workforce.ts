'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// ── Shift + status visuals (zero-orange: "amber/Late" → detector-safe yellow) ──
export const SHIFT_CHIP: Record<string, string> = {
  Morning: 'bg-indigo-100 text-indigo-700',
  Evening: 'bg-violet-100 text-violet-700',
  Night: 'bg-slate-100 text-slate-700',
  Weekend: 'bg-blue-100 text-blue-700',
  Holiday: 'bg-teal-100 text-teal-700',
};
export const SHIFT_HEX: Record<string, string> = {
  Morning: '#4F46E5', Evening: '#7C3AED', Night: '#64748B', Weekend: '#2563EB', Holiday: '#0D9488',
};
export const ATT_STATUS: Record<string, { bg: string; fg: string }> = {
  Present: { bg: '#DCFCE7', fg: '#16A34A' },
  Absent: { bg: '#FEE2E2', fg: '#DC2626' },
  Late: { bg: '#FEF9C3', fg: '#A16207' }, // yellow (amber-family, detector-safe intent)
  Leave: { bg: '#F1F5F9', fg: '#64748B' },
  NotStarted: { bg: '#F8FAFC', fg: '#94A3B8' },
};

export interface EmployeeLite {
  id: string;
  employeeNo?: string;
  jobTitle?: string;
  user: { id: string; firstName: string; lastName: string; email?: string };
  department?: { id: string; name: string } | null;
}

/** All employees for the lab (paginated endpoint, fetched wide). */
export function useEmployees() {
  return useQuery({
    queryKey: ['employees', 'all-workforce'],
    queryFn: () => api.get('/employees', { params: { page: 1, pageSize: 500 } }).then((r) => r.data),
    select: (d: any): EmployeeLite[] => d?.data ?? d ?? [],
  });
}

/** The Employee record linked to the current signed-in user, if any. */
export function useMyEmployee() {
  const { claims } = useAuth();
  const q = useEmployees();
  const me = (q.data ?? []).find((e) => e.user?.id === claims?.userId) ?? null;
  return { employee: me, isLoading: q.isLoading };
}

// ── Phase 2 status badges (zero-orange: "amber/PENDING" → detector-safe yellow) ─
export const WF_STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING: { bg: '#FEF9C3', fg: '#A16207', label: 'Pending' },
  APPROVED: { bg: '#DCFCE7', fg: '#16A34A', label: 'Approved' },
  REJECTED: { bg: '#FEE2E2', fg: '#DC2626', label: 'Rejected' },
  CANCELLED: { bg: '#F1F5F9', fg: '#64748B', label: 'Cancelled' },
};

// Attendance rate → colour (green ≥90, detector-safe yellow 75–89, red <75).
export const rateColor = (pct: number) => (pct >= 90 ? '#16A34A' : pct >= 75 ? '#A16207' : '#DC2626');
// Amber emphasis without orange (e.g. pending counts) — detector-safe yellow.
export const WARN_FG = '#A16207';

const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Integer cents → "$1,234.56". Never show raw cents on screen. */
export const fmtMoney = (cents?: number | null) => MONEY.format((cents ?? 0) / 100);
/** Minutes → hours to 1 decimal, e.g. 570 → "9.5". */
export const fmtHours = (minutes?: number | null) => ((minutes ?? 0) / 60).toFixed(1);
/** rateMultiplierX100 (150) → "1.5×". */
export const fmtMultiplier = (x100?: number | null) => `${((x100 ?? 100) / 100).toFixed(2).replace(/\.?0+$/, '')}×`;
export const daysBetweenInclusive = (start: string, end: string) => {
  if (!start || !end) return 0;
  const a = new Date(start); a.setHours(0, 0, 0, 0);
  const b = new Date(end); b.setHours(0, 0, 0, 0);
  const d = Math.floor((+b - +a) / 86_400_000) + 1;
  return d > 0 ? d : 0;
};

export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening'; };
export const fmtTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export const empName = (e?: { user?: { firstName: string; lastName: string } } | null) => (e?.user ? `${e.user.firstName} ${e.user.lastName}`.trim() : '—');
