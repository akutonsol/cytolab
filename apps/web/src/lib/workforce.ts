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

export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening'; };
export const fmtTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export const empName = (e?: { user?: { firstName: string; lastName: string } } | null) => (e?.user ? `${e.user.firstName} ${e.user.lastName}`.trim() : '—');
