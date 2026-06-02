import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL || '';

export const TOKEN_KEY   = 'ot_access_token';
export const REFRESH_KEY = 'ot_refresh_token';

export const api = axios.create({
  baseURL: `${BASE}/api`,
  withCredentials: true,
});

// Attach Bearer token on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auth endpoints — never auto-refresh on these
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/me', '/auth/logout'];

let refreshing = false;
let refreshPromise: Promise<void> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    const isAuthEndpoint = AUTH_ENDPOINTS.some(e => original?.url?.includes(e));

    if (err.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;

      // If already refreshing, wait for the same refresh to finish
      if (refreshing && refreshPromise) {
        await refreshPromise;
        return api(original);
      }

      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) {
        // No refresh token — clear storage and let React Router handle redirect
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        return Promise.reject(err);
      }

      refreshing = true;
      refreshPromise = api
        .post('/auth/refresh', { refreshToken })
        .then((res) => {
          if (res.data.accessToken) {
            localStorage.setItem(TOKEN_KEY,   res.data.accessToken);
            localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
          }
        })
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(REFRESH_KEY);
        })
        .finally(() => {
          refreshing = false;
          refreshPromise = null;
        });

      await refreshPromise;
      return api(original);
    }

    return Promise.reject(err);
  },
);
