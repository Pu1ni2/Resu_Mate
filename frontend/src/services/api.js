// // import axios from 'axios';

// // const api = axios.create({
// //   baseURL: '/api',
// //   headers: { 'Content-Type': 'application/json' }
// // });

// // // Add token to requests
// // api.interceptors.request.use(config => {
// //   config.headers.Authorization = `Bearer ${localStorage.getItem('resumate_hm_token') || 'demo-token'}`;
// //   return config;
// // });

// // export const candidatesAPI = {
// //   upload: file => {
// //     const formData = new FormData();
// //     formData.append('file', file);
// //     return api.post('/candidates/upload', formData, {
// //       headers: { 'Content-Type': 'multipart/form-data' }
// //     });
// //   },
// //   getAll: () => api.get('/candidates'),
// //   getOne: id => api.get(`/candidates/${id}`),
// //   delete: id => api.delete(`/candidates/${id}`),
// //   deleteAll: () => api.delete('/candidates')
// // };

// // export const chatAPI = {
// //   send: data => api.post('/chat/send', data),
// //   getIntro: count => api.get(`/chat/intro?candidate_count=${count}`),
// //   clear: () => api.delete('/chat/clear')
// // };

// // export default api;


// // import axios from 'axios';

// // // Production: Use environment variable
// // // Development: Use proxy (empty string)
// // const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// // const api = axios.create({
// //   baseURL: `${API_BASE_URL}/api`,
// //   headers: { 'Content-Type': 'application/json' },
// //   timeout: 60000  // 60 seconds for large file uploads
// // });

// // // Add auth header
// // api.interceptors.request.use(config => {
// //   config.headers.Authorization = `Bearer ${localStorage.getItem('resumate_hm_token') || 'demo-token'}`;
// //   return config;
// // });

// // // Handle errors
// // api.interceptors.response.use(
// //   response => response,
// //   error => {
// //     console.error('API Error:', error.response?.data || error.message);
// //     return Promise.reject(error);
// //   }
// // );

// // export const candidatesAPI = {
// //   upload: file => {
// //     const formData = new FormData();
// //     formData.append('file', file);
// //     return api.post('/candidates/upload', formData, {
// //       headers: { 'Content-Type': 'multipart/form-data' },
// //       timeout: 120000  // 2 minutes for upload + processing
// //     });
// //   },
// //   getAll: () => api.get('/candidates'),
// //   getOne: id => api.get(`/candidates/${id}`),
// //   delete: id => api.delete(`/candidates/${id}`),
// //   deleteAll: () => api.delete('/candidates')
// // };

// // export const chatAPI = {
// //   send: (data) => api.post('/chat/send', data),
// //   getIntro: (count, anonymize = false) => api.get(`/chat/intro?candidate_count=${count}&anonymize=${anonymize}`),
// //   clear: (anonymize = false) => api.delete(`/chat/clear?anonymize=${anonymize}`)
// // };

// // export default api;


// import axios from 'axios';

// // Your actual backend URL
// const API_BASE_URL = import.meta.env.PROD 
//   ? 'https://resumate-2vad.onrender.com'
//   : '';

// const api = axios.create({
//   baseURL: `${API_BASE_URL}/api`,
//   headers: { 'Content-Type': 'application/json' },
//   timeout: 120000
// });

// api.interceptors.request.use(config => {
//   config.headers.Authorization = `Bearer ${localStorage.getItem('resumate_hm_token') || 'demo-token'}`;
//   return config;
// });

// api.interceptors.response.use(
//   response => response,
//   error => {
//     console.error('API Error:', error.response?.data || error.message);
//     return Promise.reject(error);
//   }
// );

// export const candidatesAPI = {
//   upload: file => {
//     const formData = new FormData();
//     formData.append('file', file);
//     return api.post('/candidates/upload', formData, {
//       headers: { 'Content-Type': 'multipart/form-data' },
//       timeout: 120000
//     });
//   },
//   getAll: () => api.get('/candidates'),
//   getOne: id => api.get(`/candidates/${id}`),
//   delete: id => api.delete(`/candidates/${id}`),
//   deleteAll: () => api.delete('/candidates')
// };

// export const chatAPI = {
//   send: (data) => api.post('/chat/send', data),
//   getIntro: (count, anonymize = false) => api.get(`/chat/intro?candidate_count=${count}&anonymize=${anonymize}`),
//   clear: (anonymize = false) => api.delete(`/chat/clear?anonymize=${anonymize}`)
// };

// export default api;


import axios from 'axios';

const API_BASE_URL = import.meta.env.PROD
  ? 'https://resumate-api-74dm.onrender.com'
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
    // On 401, clear auth and redirect — but NOT if we're already on auth pages
    // and NOT if the 401 came from the auth endpoints themselves
    if (error.response?.status === 401) {
      const path = window.location.pathname;
      const isAuthPage = path === '/hiring/login' || path === '/hiring/register';
      const isAuthEndpoint = error.config?.url?.includes('/auth/');
      if (!isAuthPage && !isAuthEndpoint) {
        localStorage.removeItem('resumate_hm_token');
        localStorage.removeItem('resumate_hm_refresh');
        localStorage.removeItem('resumate_hm_user');
        window.location.href = '/hiring/login';
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