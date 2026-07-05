import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { claimsFromMe, useAuthStore } from './auth';

// Same-origin: Next rewrites /api/v1/* to the NestJS API on :4000 (next.config.mjs).
// `withCredentials` sends the HttpOnly auth cookies on every request; auth is no
// longer carried in an Authorization header.
export const api = axios.create({ baseURL: '/api/v1', timeout: 20_000, withCredentials: true });

/** Hydrate the claim store from the cookie session. Clears on failure. */
export async function loadClaims(): Promise<boolean> {
  try {
    const { data } = await api.get('/auth/me');
    useAuthStore.getState().setClaims(claimsFromMe(data));
    return true;
  } catch {
    useAuthStore.getState().clear();
    return false;
  }
}

// Single-flight refresh: many concurrent 401s share one refresh round-trip.
let refreshing: Promise<boolean> | null = null;

async function refreshCookie(): Promise<boolean> {
  try {
    // Bare axios (skips the interceptors below); the refresh token rides in its
    // HttpOnly cookie, so no body is needed.
    await axios.post('/api/v1/auth/refresh', {}, { timeout: 20_000, withCredentials: true });
    return true;
  } catch {
    useAuthStore.getState().clear();
    return false;
  }
}

/**
 * Deliberately refresh the session (not driven by a 401) and re-hydrate claims —
 * used when the app detects stale claims (below the expected version). Returns
 * true on success; on failure the store is cleared so the guard sends the user
 * to /login.
 */
export async function refreshSession(): Promise<boolean> {
  const ok = await refreshCookie();
  if (!ok) return false;
  return loadClaims();
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    // A 401 on the auth endpoints themselves (login/refresh) is a real failure,
    // not an expired session — never try to "refresh" those.
    const isAuthCall = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      refreshing = refreshing ?? refreshCookie();
      const ok = await refreshing;
      refreshing = null;
      if (ok) return api(original);
      // Refresh failed: the store is cleared, flipping `isAuthed` false so the
      // route guard performs a single soft redirect to /login. We deliberately
      // avoid a hard navigation here (it fights the guard and ping-pongs).
    }
    return Promise.reject(error);
  },
);

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
