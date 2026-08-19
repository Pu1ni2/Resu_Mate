import axios from 'axios';

import { getToken, handleUnauthorized } from './session';

const API_BASE_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com')
  : '';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000
});

// Attach the hiring manager JWT on every request
api.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    // Expiry handling lives in services/session.js so the raw fetch() call
    // sites behave identically — they used to do nothing at all on a 401.
    if (error.response?.status === 401) {
      handleUnauthorized(error.config?.url);
    }
    return Promise.reject(error);
  }
);

export const candidatesAPI = {
  upload: file => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/candidates/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000
    });
  },
  getAll: () => api.get('/candidates'),
  getOne: id => api.get(`/candidates/${id}`),
  delete: id => api.delete(`/candidates/${id}`),
  deleteAll: () => api.delete('/candidates')  // This clears backend
};

export const chatAPI = {
  send: (data) => api.post('/chat/send', data),
  // The query param is `count`, not `candidate_count`. It was the latter, which
  // FastAPI silently ignored, so the intro message was always generated as if
  // zero candidates were selected.
  getIntro: (count, anonymize = false) => api.get(`/chat/intro?count=${count}&anonymize=${anonymize}`),
  // POST, not DELETE. The backend registers POST /chat/clear, so this returned
  // 405 on every call — invisible, because the caller ignores the rejection and
  // clears local state anyway, leaving the server's history intact.
  clear: () => api.post('/chat/clear')
};

export default api;