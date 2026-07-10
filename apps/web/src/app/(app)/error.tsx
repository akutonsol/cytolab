'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';

/**
 * Route-segment error boundary. Before this, a thrown render error left the user on a
 * blank content area with no way back (Experience Report F3).
 *
 * It offers the one action that usually works — retry — and never blames the user.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surfaced to Sentry by the guarded client init; console keeps it visible in dev.
    console.error('[route error]', error);
  }, [error]);

  return (
    <div className="min-h-full pt-4">
      <EmptyState
        className="mt-16"
        icon={<AlertTriangle size={28} />}
        title="This screen didn’t load"
        description="Something went wrong while rendering it. Your work has not been lost."
        action={
          <Button variant="secondary" icon={<RotateCcw size={14} />} onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
