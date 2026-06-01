import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL || '';

export const api = axios.create({
  baseURL: `${BASE}/api`,
  withCredentials: true,
});

// Read CSRF token from cookie and attach to all state-changing requests
api.interceptors.request.use((config) => {
  if (['post', 'put', 'patch', 'delete'].includes(config.method ?? '')) {
    const csrf = document.cookie
      .split('; ')
      .find((r) => r.startsWith('csrf_token='))
      ?.split('=')[1];
    if (csrf) config.headers['X-CSRF-Token'] = csrf;
  }
  return config;
});

// Auto-refresh on 401
let refreshing = false;
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry && !refreshing) {
      original._retry = true;
      refreshing = true;
      try {
        await api.post('/auth/refresh');
        refreshing = false;
        return api(original);
      } catch {
        refreshing = false;
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);
