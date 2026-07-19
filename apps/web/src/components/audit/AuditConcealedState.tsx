'use client';

import { FileQuestion } from 'lucide-react';
import { EmptyState } from '@/components/ui';

/**
 * Program 2 · P2-8C — the ONE neutral experience for a detail 404: nonexistent, out-of-scope,
 * unauthorized-by-scope, or deliberately concealed — indistinguishable by design. No retry (a retry
 * would imply the event exists), no reason, no styling variation, no backend detail.
 */
export function AuditConcealedState() {
  return (
    <EmptyState
      icon={<FileQuestion size={22} />}
      title="This audit event isn’t available."
      description="It may not exist, or it may be outside the events you can view."
    />
  );
}
