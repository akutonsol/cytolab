'use client';

import { useFeatures } from '@/lib/feature-context';
import { WorkforceNotificationBell } from '@/components/workforce/WorkforceNotificationDrawer';

/**
 * Shared shell for the /workforce section. Renders a slim header strip carrying
 * the workforce notification bell (only when the feature is enabled); each page
 * still renders — and self-gates — its own content below.
 */
export default function WorkforceLayout({ children }: { children: React.ReactNode }) {
  const { isEnabled } = useFeatures();
  return (
    <div>
      {isEnabled('WORKFORCE_MANAGEMENT') && (
        <div className="mb-3 flex items-center justify-end">
          <WorkforceNotificationBell />
        </div>
      )}
      {children}
    </div>
  );
}
