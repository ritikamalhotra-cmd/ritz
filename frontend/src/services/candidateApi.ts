import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL || '';

export const candidateApi = axios.create({
  baseURL: `${BASE}/api`,
});

candidateApi.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('portal_token');
  if (token) config.headers['X-Portal-Token'] = token;
  return config;
});
