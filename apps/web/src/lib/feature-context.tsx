'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuthStore } from './auth';
import type { FeatureKey } from './features';

interface FeatureContextValue {
  isEnabled: (key: FeatureKey) => boolean;
  enabledFeatures: FeatureKey[];
  isLoading: boolean;
}

const Ctx = createContext<FeatureContextValue>({
  isEnabled: () => true,
  enabledFeatures: [],
  isLoading: false,
});

/**
 * Fetches the caller's lab's enabled feature keys once on app load and caches
 * them. While the fetch is in flight (and a session exists) features are treated
 * as enabled so built UI doesn't flash out; once loaded, the real set is
 * enforced. A logged-out app has no lab, so gating is a no-op (returns enabled).
 */
export function FeatureProvider({ children }: { children: ReactNode }) {
  const isAuthed = useAuthStore((s) => !!s.claims);

  const { data, isLoading } = useQuery({
    queryKey: ['lab-features-enabled'],
    queryFn: async () => {
      const res = await api.get<{ enabled: FeatureKey[] }>('/lab-features/enabled');
      return res.data.enabled;
    },
    enabled: isAuthed,
    staleTime: 5 * 60_000,
  });

  const value = useMemo<FeatureContextValue>(() => {
    const loading = isAuthed && isLoading && !data;
    const set = new Set<FeatureKey>(data ?? []);
    return {
      // Logged out → nothing to gate (login/public shells). Loading → optimistic on.
      isEnabled: (key) => (!isAuthed ? true : loading ? true : set.has(key)),
      enabledFeatures: data ?? [],
      isLoading: loading,
    };
  }, [isAuthed, isLoading, data]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useFeatures = () => useContext(Ctx);
