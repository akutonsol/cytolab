'use client';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

interface ScrollSentinelProps {
  loading: boolean;
  hasMore: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const ScrollSentinel = forwardRef<HTMLDivElement, ScrollSentinelProps>(
  ({ loading, hasMore, error, onRetry }, ref) => {
    if (!hasMore && !loading) return (
      <div ref={ref} className="py-8 text-center text-sm text-gray-400">
        All records loaded
      </div>
    );
    return (
      <div ref={ref} className="py-6 flex flex-col items-center justify-center gap-2">
        {loading && (
          <div className="flex items-center gap-2 text-indigo-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium text-gray-500">Loading more...</span>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm text-red-500">{error}</span>
            {onRetry && (
              <button onClick={onRetry} className="text-sm text-indigo-600 hover:underline">
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
);
ScrollSentinel.displayName = 'ScrollSentinel';
