import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AuthClaims {
  userId: string;
  email: string;
  labId: string;
  roles: string[];
  permissions: string[];
  isSuperRole: boolean;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      clear: () => set({ accessToken: null, refreshToken: null }),
    }),
    {
      name: 'cytolab-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken }),
    },
  ),
);

/**
 * True once the persisted store has been read from localStorage on the client.
 * The route guard must wait for this before deciding logged-in vs logged-out.
 *
 * Uses zustand-persist's hydration API, which completes (and fires
 * onFinishHydration) even when there is NOTHING stored — unlike the previous
 * onRehydrateStorage flag, which never flipped true for a logged-out user and
 * left the guard stuck on a spinner. Starts false to match the server render
 * (avoids a hydration mismatch), then flips true after mount.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);
  return hydrated;
}

/** Decode the JWT payload to read roles/permissions — the source of truth for nav gating. */
export function decodeClaims(token: string | null): AuthClaims | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(json);
    return {
      userId: p.sub,
      email: p.email,
      labId: p.labId,
      roles: p.roles ?? [],
      permissions: p.permissions ?? [],
      isSuperRole: p.isSuperRole === true,
    };
  } catch {
    return null;
  }
}

/**
 * Mirror the API's PermissionsGuard: any super role (isSuperRole flag, not a
 * hardcoded name) bypasses every check and carries no explicit permission codes,
 * so it must see all nav.
 */
export function claimsHavePermission(claims: AuthClaims | null, code?: string): boolean {
  if (!claims) return false;
  if (!code) return true;
  if (claims.isSuperRole) return true;
  return claims.permissions.includes(code);
}

export function useAuth() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const hydrated = useHydrated();
  const claims = useMemo(() => decodeClaims(accessToken), [accessToken]);
  const can = (code?: string) => claimsHavePermission(claims, code);
  return { claims, hydrated, isAuthed: !!claims, can };
}
