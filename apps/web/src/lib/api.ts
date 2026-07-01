import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from './auth';

// Same-origin: Next rewrites /api/v1/* to the NestJS API on :4000 (next.config.mjs).
// A finite timeout guarantees a hung request rejects (error state) instead of
// spinning forever.
export const api = axios.create({ baseURL: '/api/v1', timeout: 20_000 });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single-flight refresh: many concurrent 401s share one refresh round-trip.
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  // No refresh token is itself a logged-out state — clear so the route guard
  // sees `isAuthed === false` and navigates cleanly (no token left behind that
  // would bounce /login back to a protected page).
  if (!refreshToken) {
    useAuthStore.getState().clear();
    return null;
  }
  try {
    // Bare axios (not `api`) so this request skips the interceptors below; its
    // own timeout so a stuck refresh can't wedge every queued request.
    const res = await axios.post('/api/v1/auth/refresh', { refreshToken }, { timeout: 20_000 });
    useAuthStore.getState().setTokens(res.data.accessToken, res.data.refreshToken);
    return res.data.accessToken as string;
  } catch {
    useAuthStore.getState().clear();
    return null;
  }
}

/**
 * Deliberately refresh the session (not driven by a 401). Used when the app
 * detects a token whose claims are stale (below the expected version) — it
 * re-issues a token carrying the current claims so the UI never renders from a
 * stale token. Returns true on success; on failure the store is cleared so the
 * route guard sends the user to /login.
 */
export async function refreshSession(): Promise<boolean> {
  const token = await refreshAccessToken();
  return token != null;
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
      refreshing = refreshing ?? refreshAccessToken();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      // Refresh failed: tokens are now cleared. We deliberately do NOT
      // window.location.href = '/login' here — a hard navigation fights the
      // React route guard and ping-pongs (the loop). Clearing the store flips
      // `isAuthed` to false, and the guard performs a single soft redirect to
      // /login. The rejection below also lets React Query surface an error
      // state instead of spinning forever.
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
