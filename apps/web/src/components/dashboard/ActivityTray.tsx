'use client';

import { Fragment } from 'react';
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
  dot: string;
  label: string;
  badge: string;
  count: number;
  onClick: () => void;
  /** Pulse the status dot to draw the eye to active alerts. */
  pulse?: boolean;
  /** Optional ring utilities applied to the chip button (e.g. escalation). */
  ring?: string;
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

  const escCount = isEnabled('ABNORMAL_ESCALATION') ? escSummary?.pending ?? 0 : 0;
  const aiCount = isEnabled('AI_SCREENING') ? aiAnalytics?.pendingReview ?? 0 : 0;
  const fhirCount = isEnabled('HL7_FHIR') ? fhirStats?.todayCount ?? 0 : 0;

  const chips: Chip[] = [];
  if (escCount > 0) {
    chips.push({ key: 'esc', dot: 'bg-red-500', label: 'Escalation', badge: 'bg-red-100 text-red-700', count: escCount, onClick: () => router.push('/results?filter=escalated'), pulse: true, ring: 'ring-1 ring-red-200' });
  }
  if (aiCount > 0) {
    chips.push({ key: 'ai', dot: 'bg-indigo-500', label: 'AI reviews', badge: 'bg-indigo-100 text-indigo-700', count: aiCount, onClick: () => router.push('/results?filter=ai-pending'), pulse: true });
  }
  if (fhirCount > 0) {
    chips.push({ key: 'fhir', dot: 'bg-emerald-500', label: 'FHIR sent', badge: 'bg-emerald-100 text-emerald-700', count: fhirCount, onClick: () => router.push('/settings/fhir') });
  }

  if (chips.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-5 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {chips.map((chip, i) => (
          <Fragment key={chip.key}>
            {i > 0 && <div className="w-px h-4 bg-gray-200" />}
            <button
              onClick={chip.onClick}
              className={`rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 cursor-pointer ${chip.ring ?? ''}`}
            >
              <span className={`w-2 h-2 rounded-full ${chip.dot} ${chip.pulse ? 'animate-pulse' : ''}`} />
              <span className="font-medium">{chip.label}</span>
              <span className={`text-xs font-medium px-2 rounded-full ${chip.badge}`}>{chip.count}</span>
            </button>
          </Fragment>
        ))}
      </div>
      <button
        onClick={() => router.push('/notifications')}
        className="text-indigo-600 text-xs font-medium hover:text-indigo-700 shrink-0"
      >
        View all →
      </button>
    </div>
  );
}
