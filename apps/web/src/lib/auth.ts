import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Minimum staff-claims version this build understands. Must match the API's
// TOKEN_CLAIMS_VERSION. Claims below this predate a permissions-model change and
// must NOT be used to render UI — the app forces a refresh.
export const EXPECTED_CLAIMS_VERSION = 3;

export interface AuthClaims {
  userId: string;
  email: string;
  labId: string;
  roles: string[];
  permissions: string[];
  isSuperRole: boolean;
  ver: number;
}

/**
 * Cookie-era auth store.
 *
 * The access + refresh tokens now live in HttpOnly cookies the browser cannot
 * read, so the store no longer holds tokens — it holds only the (non-secret)
 * claims used to gate nav and permissions. Actual authentication rides on the
 * cookies; these claims are hydrated from `GET /auth/me` after login/refresh.
 */
interface AuthState {
  claims: AuthClaims | null;
  setClaims: (claims: AuthClaims | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      claims: null,
      setClaims: (claims) => set({ claims }),
      clear: () => set({ claims: null }),
    }),
    {
      name: 'cytolab-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ claims: s.claims }),
    },
  ),
);

/**
 * True once the persisted store has been read from localStorage on the client.
 * The route guard must wait for this before deciding logged-in vs logged-out.
 * Starts false to match the server render, then flips true after mount.
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

/** Map a `GET /auth/me` payload into the client claim shape. */
export function claimsFromMe(data: any): AuthClaims {
  return {
    userId: data.id,
    email: data.email,
    labId: data.labId,
    roles: data.roles ?? [],
    permissions: data.permissions ?? [],
    isSuperRole: data.isSuperRole === true,
    ver: typeof data.ver === 'number' ? data.ver : EXPECTED_CLAIMS_VERSION,
  };
}

/**
 * Claims that predate the current permission model (below the expected
 * version). Their roles/permissions can't be trusted to render UI, so the app
 * must re-hydrate rather than show a misleadingly empty app.
 */
export function claimsAreStale(claims: AuthClaims | null): boolean {
  return !!claims && claims.ver < EXPECTED_CLAIMS_VERSION;
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
  const claims = useAuthStore((s) => s.claims);
  const hydrated = useHydrated();
  const can = useMemo(() => (code?: string) => claimsHavePermission(claims, code), [claims]);
  return { claims, hydrated, isAuthed: !!claims, stale: claimsAreStale(claims), can };
}
