'use client';

import type { ReportCategory } from '@/lib/report-center';

// Small decorative table/chart illustration per report category (80x60).
const TINT: Record<ReportCategory, string> = {
  Specimen: '#E0E7FF', Clinical: '#DBEAFE', Financial: '#DCFCE7', Patient: '#EDE9FE', Staff: '#F1F5F9', Quality: '#FEF2F2',
};
const BAR: Record<ReportCategory, string> = {
  Specimen: '#4F46E5', Clinical: '#3B82F6', Financial: '#16A34A', Patient: '#7C3AED', Staff: '#64748B', Quality: '#DC2626',
};

export function ReportThumb({ category }: { category: ReportCategory }) {
  const tint = TINT[category];
  const bar = BAR[category];
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" fill="none" className="shrink-0 rounded-lg" aria-hidden>
      <rect width="80" height="60" rx="8" fill={tint} />
      {/* header line */}
      <rect x="10" y="10" width="34" height="5" rx="2.5" fill={bar} opacity="0.9" />
      {/* table rows */}
      <rect x="10" y="22" width="60" height="3" rx="1.5" fill="#fff" />
      <rect x="10" y="30" width="52" height="3" rx="1.5" fill="#fff" />
      <rect x="10" y="38" width="58" height="3" rx="1.5" fill="#fff" />
      <rect x="10" y="46" width="44" height="3" rx="1.5" fill="#fff" />
      {/* mini bars */}
      <rect x="58" y="30" width="4" height="19" rx="1" fill={bar} opacity="0.55" />
      <rect x="64" y="24" width="4" height="25" rx="1" fill={bar} opacity="0.8" />
    </svg>
  );
}
