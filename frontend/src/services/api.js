import axios from 'axios';

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
  const token = localStorage.getItem('resumate_hm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    // On 401, clear auth and dispatch an event for App.jsx to handle via React
    // Router. We deliberately avoid window.location.href because the hard reload
    // kills in-progress Jarvis conversations, voice sessions, and uploads.
    if (error.response?.status === 401) {
      const path = window.location.pathname;
      const isAuthPage = path === '/hiring/login' || path === '/hiring/register';
      const isAuthEndpoint = error.config?.url?.includes('/auth/');
      if (!isAuthPage && !isAuthEndpoint) {
        localStorage.removeItem('resumate_hm_token');
        localStorage.removeItem('resumate_hm_refresh');
        localStorage.removeItem('resumate_hm_user');
        try {
          window.dispatchEvent(new CustomEvent('resumate:unauthorized'));
        } catch (_) {
          // Fallback for old browsers that lack CustomEvent — last-resort hard nav.
          window.location.href = '/hiring/login';
        }
      }
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
  getIntro: (count, anonymize = false) => api.get(`/chat/intro?candidate_count=${count}&anonymize=${anonymize}`),
  clear: (anonymize = false) => api.delete(`/chat/clear?anonymize=${anonymize}`)
};

export default api;