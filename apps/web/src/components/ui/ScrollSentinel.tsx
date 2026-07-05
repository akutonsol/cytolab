'use client';
import { forwardRef } from 'react';

interface ScrollSentinelProps {
  loading: boolean;
  hasMore: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const ScrollSentinel = forwardRef<HTMLDivElement, ScrollSentinelProps>(
  ({ loading, hasMore, error, onRetry }, ref) => {
    if (!hasMore && !loading) return (
      <div ref={ref} className="py-6 text-center">
        <div className="inline-flex items-center gap-2 text-xs text-gray-400 bg-gray-50 px-4 py-2 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          All records loaded
          <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
        </div>
      </div>
    );
    return (
      <div ref={ref} className="py-6 flex flex-col items-center justify-center gap-2">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
            </div>
            <span className="text-sm font-medium text-gray-500 animate-pulse">
              Loading more...
            </span>
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
