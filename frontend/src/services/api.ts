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

  // CSRF for cookie-based sessions (local dev fallback)
  if (['post', 'put', 'patch', 'delete'].includes(config.method ?? '')) {
    const csrf = document.cookie
      .split('; ')
      .find((r) => r.startsWith('csrf_token='))
      ?.split('=')[1];
    if (csrf) config.headers['X-CSRF-Token'] = csrf;
  }
  return config;
});

// Auth endpoints that should never trigger auto-refresh
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/me'];

let refreshing = false;

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    const isAuthEndpoint = AUTH_ENDPOINTS.some(e => original?.url?.includes(e));

    // Only auto-refresh on 401 for non-auth endpoints
    if (err.response?.status === 401 && !original._retry && !refreshing && !isAuthEndpoint) {
      original._retry = true;
      refreshing = true;
      try {
        const refreshToken = localStorage.getItem(REFRESH_KEY);
        if (!refreshToken) throw new Error('No refresh token');

        const res = await api.post('/auth/refresh', { refreshToken });
        if (res.data.accessToken) {
          localStorage.setItem(TOKEN_KEY,   res.data.accessToken);
          localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
        }
        refreshing = false;
        return api(original);
      } catch {
        refreshing = false;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);
