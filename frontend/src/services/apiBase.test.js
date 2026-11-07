import { describe, it, expect, afterEach, vi } from 'vitest';

import { API_BASE } from './authFetch';
import { apiUrlProblem } from '../../build-checks.js';

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

  it('names no deployment anywhere in the app', () => {
    // authFetch.js fell back to one deployment's backend.
    const naming = Object.entries(sources).filter(([, text]) => text.includes('onrender.com')).map(([path]) => path);
    expect(naming).toEqual([]);
  });

  it('is the same origin in development, where Vite proxies /api', () => {
    expect(API_BASE).toBe('');
  });
});

describe('the backend address in a production build', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function apiBaseWith(url) {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_API_URL', url);
    vi.resetModules();
    return (await import('./authFetch')).API_BASE;
  }

  it('is VITE_API_URL when the build sets it', async () => {
    expect(await apiBaseWith('https://api.example.com')).toBe('https://api.example.com');
  });

  // It fell back to one deployment's backend; a Render build without it now
  // fails instead (build-checks.js).
  it('has no fallback when the build does not set it', async () => {
    expect(await apiBaseWith('')).toBe('');
  });

  it('drops a trailing slash, which made "//api" in every call', async () => {
    expect(await apiBaseWith('https://api.example.com/')).toBe('https://api.example.com');
  });
});

describe("a production build's settings", () => {
  // Render sets RENDER while it builds the site.
  it('stop a build on Render that has no API address', () => {
    expect(apiUrlProblem({ RENDER: 'true' })).toMatch(/VITE_API_URL isn't set/);
    expect(apiUrlProblem({ RENDER: 'true', VITE_API_URL: '  ' })).toMatch(/VITE_API_URL isn't set/);
  });

  it('let a build on Render with one, or a build elsewhere, go ahead', () => {
    expect(apiUrlProblem({ RENDER: 'true', VITE_API_URL: 'https://api.example.com' })).toBeNull();
    expect(apiUrlProblem({})).toBeNull();
  });
});
