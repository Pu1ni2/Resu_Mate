// API Configuration — single source of truth
// In development: proxied through Vite (empty string)
// In production: uses VITE_API_URL env variable or falls back to hardcoded Render URL

export const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com')
  : '';