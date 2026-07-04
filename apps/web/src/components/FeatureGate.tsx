'use client';

import type { ReactNode } from 'react';
import { useFeatures } from '@/lib/feature-context';
import type { FeatureKey } from '@/lib/features';

interface Props {
  feature: FeatureKey;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders children only when `feature` is enabled for the current lab; otherwise
 * renders `fallback` (null by default).
 *
 *   <FeatureGate feature="BETHESDA_SYSTEM"><BethesdaButton /></FeatureGate>
 */
export function FeatureGate({ feature, fallback = null, children }: Props) {
  const { isEnabled } = useFeatures();
  return <>{isEnabled(feature) ? children : fallback}</>;
}
