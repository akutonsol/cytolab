'use client';

import { Badge } from '@/components/ui';
import type { BadgeProps } from '@/components/ui';

/**
 * Program 2 · P2-8B — semantic badges for audit rows. Consumes only Badge tones (Tier-2 tokens);
 * WARNING maps to the amber `warning` token (`--color-warning`, NOT orange — zero-orange rule).
 */
const SEVERITY_TONE: Record<string, BadgeProps['tone']> = {
  INFO: 'info',
  NOTICE: 'neutral',
  WARNING: 'warning',
  CRITICAL: 'danger-strong',
};
const OUTCOME_TONE: Record<string, BadgeProps['tone']> = {
  SUCCESS: 'success',
  FAILURE: 'danger',
  DENIED: 'danger-strong',
  ERROR: 'danger',
};

export function CategoryBadge({ value }: { value: string }) {
  return <Badge size="sm" tone="neutral" weight="medium">{value}</Badge>;
}

export function SeverityBadge({ value }: { value: string }) {
  return <Badge size="sm" tone={SEVERITY_TONE[value] ?? 'neutral'}>{value}</Badge>;
}

export function OutcomeBadge({ value }: { value: string }) {
  return <Badge size="sm" tone={OUTCOME_TONE[value] ?? 'neutral'}>{value}</Badge>;
}
