import { describe, it, expect } from 'vitest';

import { API_BASE } from './authFetch';

/* The backend's production address lives in one place: API_BASE in
 * services/authFetch.js. It was copied into sixteen files, each with its own
 * VITE_API_URL fallback, so moving the backend meant finding every copy. */
const sources = import.meta.glob(['../**/*.{js,jsx}', '!../**/*.test.{js,jsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('the backend address', () => {
  it('is written down only in services/authFetch.js', () => {
    // The scan reaches the components, or this would pass by reading nothing.
    expect(Object.keys(sources)).toContain('../components/Dashboard.jsx');
    const naming = Object.entries(sources)
      .filter(([, text]) => text.includes('onrender.com') || text.includes('VITE_API_URL'))
      .map(([path]) => path);
    expect(naming).toEqual(['./authFetch.js']);
  });

  it('is the same origin in development, where Vite proxies /api', () => {
    expect(API_BASE).toBe('');
  });
});
