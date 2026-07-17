'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';

/**
 * Compact activity tray shown above the KPI strip. Consolidates the escalation,
 * AI-review and FHIR alert banners into a single row of chips. Reads from the
 * same query keys the dashboard already uses (React Query dedupes — no new
 * network call) and renders null when every count is zero.
 */
type Chip = {
  key: string;
  /** Chip background + hover, e.g. 'bg-red-50 hover:bg-red-100'. */
  chipBg: string;
  /** Status-dot colour, e.g. 'bg-red-500'. */
  dot: string;
  /** Text colour, e.g. 'text-red-700'. */
  text: string;
  label: string;
  count: number;
  onClick: () => void;
  /** Pulse the status dot to draw the eye to active alerts. */
  pulse?: boolean;
  /**
   * Stable dynamic prioritization (Phase 1): a documented, deterministic rank so
   * the most urgent alert leads the row. 1 escalation (clinical urgency) · 2
   * quality alerts (QC failures) · 3 AI reviews (routine) · 4 FHIR (informational).
   * Emphasis before position: chips stay in this row, only their order reflects
   * priority; the label is the reason for the promotion.
   */
  rank: number;
};

export function ActivityTray() {
  const router = useRouter();
  const { isEnabled } = useFeatures();

  const { data: escSummary } = useQuery({
    queryKey: ['escalation-summary'],
    queryFn: () => api.get('/escalations/summary').then((r) => r.data as { pending: number }),
    enabled: isEnabled('ABNORMAL_ESCALATION'),
    refetchInterval: 60_000,
  });
  const { data: aiAnalytics } = useQuery({
    queryKey: ['ai-analytics'],
    queryFn: () => api.get('/ai-screening/analytics').then((r) => r.data as { pendingReview: number }),
    enabled: isEnabled('AI_SCREENING'),
  });
  const { data: fhirStats } = useQuery({
    queryKey: ['fhir-stats'],
    queryFn: () => api.get('/fhir/stats').then((r) => r.data as { todayCount: number }),
    enabled: isEnabled('HL7_FHIR'),
  });
  const { data: qcAlerts } = useQuery({
    queryKey: ['qc-alerts'],
    queryFn: () => api.get('/qc/alerts').then((r) => r.data as { status: string }[]),
    enabled: isEnabled('QC_MODULE'),
    refetchInterval: 60_000,
  });

  const escCount = isEnabled('ABNORMAL_ESCALATION') ? escSummary?.pending ?? 0 : 0;
  const aiCount = isEnabled('AI_SCREENING') ? aiAnalytics?.pendingReview ?? 0 : 0;
  const fhirCount = isEnabled('HL7_FHIR') ? fhirStats?.todayCount ?? 0 : 0;
  const qcCount = isEnabled('QC_MODULE') ? qcAlerts?.filter((a) => a.status !== 'Resolved').length ?? 0 : 0;

  const chips: Chip[] = [];
  if (escCount > 0) {
    chips.push({ key: 'esc', rank: 1, chipBg: 'bg-red-50 hover:bg-red-100', dot: 'bg-red-500', text: 'text-red-700', label: 'Escalation', count: escCount, onClick: () => router.push('/results?filter=escalated'), pulse: true });
  }
  if (aiCount > 0) {
    chips.push({ key: 'ai', rank: 3, chipBg: 'bg-indigo-50 hover:bg-indigo-100', dot: 'bg-indigo-500', text: 'text-indigo-700', label: 'AI Reviews', count: aiCount, onClick: () => router.push('/results?filter=ai-pending'), pulse: true });
  }
  if (qcCount > 0) {
    // Zero-orange: QC warnings use rose (not amber) to stay off the detector.
    chips.push({ key: 'qc', rank: 2, chipBg: 'bg-rose-50 hover:bg-rose-100', dot: 'bg-rose-500', text: 'text-rose-700', label: 'Quality Alerts', count: qcCount, onClick: () => router.push('/qc'), pulse: true });
  }
  if (fhirCount > 0) {
    chips.push({ key: 'fhir', rank: 4, chipBg: 'bg-emerald-50 hover:bg-emerald-100', dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'FHIR Sent', count: fhirCount, onClick: () => router.push('/settings/fhir') });
  }

  // Deterministic priority order; Array.sort is stable, so equal-rank chips keep
  // insertion order and never shuffle between refreshes.
  chips.sort((a, b) => a.rank - b.rank);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 gap-y-2 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
      <span className="mr-2 text-xs font-bold uppercase tracking-widest text-gray-900">Action Center</span>
      <div className="h-4 w-px bg-gray-200" />
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={chip.onClick}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-colors ${chip.chipBg}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${chip.dot} ${chip.pulse ? 'animate-pulse' : ''}`} />
          <span className={`text-[13px] font-semibold ${chip.text}`}>{chip.count} {chip.label}</span>
        </button>
      ))}
      <div className="ml-auto">
        <button
          onClick={() => router.push('/notifications')}
          className="text-[13px] font-semibold text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
        >
          View All →
        </button>
      </div>
    </div>
  );
}
