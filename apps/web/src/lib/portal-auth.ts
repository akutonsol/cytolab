import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PortalClaims {
  sub: string; // portalUserId
  clientId: string;
  labId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  aud?: string; // 'portal'
}

interface PortalAuthState {
  token: string | null;
  refreshToken: string | null;
  claims: PortalClaims | null;
  hydrated: boolean;
  setTokens: (token: string, refreshToken: string) => void;
  clear: () => void;
  setHydrated: () => void;
}

// Decode JWT claims without verification (client-side only).
function parseClaims(token: string): PortalClaims | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export const usePortalAuthStore = create<PortalAuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      claims: null,
      hydrated: false,
      setTokens: (token, refreshToken) => set({ token, refreshToken, claims: parseClaims(token) }),
      clear: () => set({ token: null, refreshToken: null, claims: null }),
      setHydrated: () => set({ hydrated: true }),
    }),
    { name: 'portal-auth', onRehydrateStorage: () => (state) => state?.setHydrated() },
  ),
);

export function usePortalAuth() {
  const { token, claims, hydrated, clear } = usePortalAuthStore();
  return { token, claims, hydrated, isAuthed: !!token, clear };
}
