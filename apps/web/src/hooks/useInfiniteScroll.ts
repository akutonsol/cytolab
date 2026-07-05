import { useState, useEffect, useRef, useCallback } from 'react';

interface UseInfiniteScrollOptions<T> {
  fetchFn: (page: number, pageSize: number) => Promise<{ data: T[]; total: number; page: number }>;
  pageSize?: number;
  enabled?: boolean;
}

export function useInfiniteScroll<T>({ fetchFn, pageSize = 20, enabled = true }: UseInfiniteScrollOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = items.length < total;

  const loadPage = useCallback(async (pageNum: number, reset = false) => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      // Minimum 600ms spinner time on APPEND loads only, so the spinner is
      // always visible even when data resolves instantly (client-windowed
      // lists). The initial load (reset) stays fast — no artificial delay.
      const fetchPromise = fetchFn(pageNum, pageSize);
      const result = reset
        ? await fetchPromise
        : await Promise.all([fetchPromise, new Promise(resolve => setTimeout(resolve, 600))]).then(([r]) => r);
      setItems(prev => reset ? result.data : [...prev, ...result.data]);
      setTotal(result.total);
      setPage(pageNum);
    } catch (err) {
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [fetchFn, pageSize, enabled]);

  // Initial load
  useEffect(() => {
    loadPage(1, true);
  }, [loadPage]);

  // Intersection observer for sentinel
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading) return;
    observerRef.current = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadPage(page + 1); },
      { threshold: 0.1, rootMargin: '200px' }
    );
    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, page, loadPage]);

  const reset = useCallback(() => loadPage(1, true), [loadPage]);

  return { items, loading, initialLoading, error, hasMore, sentinelRef, total, reset };
}

/**
 * Window a fully-fetched array into a { data, total, page } page — for endpoints
 * that return a whole (backend-capped) list rather than server-paginated pages.
 * Pair with a fetchFn that fetches the list once and caches it per filter set.
 */
export function clientPage<T>(all: T[], page: number, pageSize: number): { data: T[]; total: number; page: number } {
  const start = (page - 1) * pageSize;
  return { data: all.slice(start, start + pageSize), total: all.length, page };
}
