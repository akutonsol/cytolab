'use client';

import { ShieldCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui';

/**
 * Full-page "module not enabled" screen. Rendered by a page when its required
 * feature is off for the lab, so a directly-navigated URL (bookmark, typed path)
 * is blocked the same way its nav link is hidden.
 */
export function FeatureDisabled({ name }: { name: string }) {
  return (
    <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
      <EmptyState
        className="mt-16"
        icon={<ShieldCheck size={28} />}
        title={<>Module not enabled</>}
        description={<>{name} is disabled for this lab. An administrator can enable it under Modules.</>}
      />
    </div>
  );
}
