import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AuthClaims {
  userId: string;
  email: string;
  labId: string;
  roles: string[];
  permissions: string[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  hydrated: boolean;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      hydrated: false,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      clear: () => set({ accessToken: null, refreshToken: null }),
    }),
    {
      name: 'cytolab-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken }),
      onRehydrateStorage: () => (state) => {
        useAuthStore.setState({ hydrated: true });
      },
    },
  ),
);

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
    };
  } catch {
    return null;
  }
}

/**
 * Mirror the API's PermissionsGuard: the Superuser role bypasses every check
 * (and carries no explicit permission codes), so it must see all nav.
 */
export function claimsHavePermission(claims: AuthClaims | null, code?: string): boolean {
  if (!claims) return false;
  if (!code) return true;
  if (claims.roles.includes('Superuser')) return true;
  return claims.permissions.includes(code);
}

export function useAuth() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const hydrated = useAuthStore((s) => s.hydrated);
  const claims = useMemo(() => decodeClaims(accessToken), [accessToken]);
  const can = (code?: string) => claimsHavePermission(claims, code);
  return { claims, hydrated, isAuthed: !!claims, can };
}
