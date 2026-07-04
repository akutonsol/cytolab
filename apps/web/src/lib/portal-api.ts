import axios from 'axios';
import { usePortalAuthStore } from './portal-auth';

// Same-origin base as the staff client: Next rewrites /api/v1/* to the NestJS
// API (global prefix api/v1), so portal routes resolve to /api/v1/portal/*.
export const portalApi = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
});

portalApi.interceptors.request.use((config) => {
  const token = usePortalAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

portalApi.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && err.config && !err.config._retry) {
      const { refreshToken, setTokens, clear } = usePortalAuthStore.getState();
      if (refreshToken) {
        try {
          const { data } = await axios.post('/api/v1/portal/auth/refresh', { refreshToken });
          setTokens(data.accessToken, data.refreshToken);
          err.config._retry = true;
          err.config.headers.Authorization = `Bearer ${data.accessToken}`;
          return portalApi(err.config);
        } catch {
          clear();
        }
      } else {
        clear();
      }
    }
    return Promise.reject(err);
  },
);
