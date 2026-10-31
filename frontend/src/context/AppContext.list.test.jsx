import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';

import { AppProvider, useApp } from './AppContext';
import { candidatesAPI } from '../services/api';

/* Whether the candidate list has come from the server: 'loading' until it has
 * answered, then 'loaded', or 'failed' when it couldn't be reached. The pages
 * go by this, so an empty list doesn't read as having no candidates before
 * the list has come, or when it couldn't. */

const ADA = { id: 1, name: 'Ada', skills: [] };

let app;
function Probe() {
  app = useApp();
  return null;
}

// A reply that comes when the test says.
function later() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the candidate list's status", () => {
  it('is loading until the server answers, then loaded', async () => {
    const reply = later();
    vi.spyOn(candidatesAPI, 'getAll').mockReturnValue(reply.promise);
    render(<AppProvider><Probe /></AppProvider>);
    expect(app.candidatesStatus).toBe('loading');
    let loaded;
    act(() => { loaded = app.loadCandidates(); });
    expect(app.candidatesStatus).toBe('loading');
    await act(async () => { reply.resolve({ data: { candidates: [] } }); await loaded; });
    expect(app.candidatesStatus).toBe('loaded');
    expect(app.candidates).toEqual([]);
  });

  it('is failed when the server cannot be reached, and loaded once trying again works', async () => {
    const getAll = vi.spyOn(candidatesAPI, 'getAll').mockRejectedValueOnce(new Error('Network Error'));
    render(<AppProvider><Probe /></AppProvider>);
    await act(async () => { await app.loadCandidates(); });
    expect(app.candidatesStatus).toBe('failed');

    getAll.mockResolvedValueOnce({ data: { candidates: [ADA] } });
    await act(async () => { await app.loadCandidates(); });
    expect(app.candidatesStatus).toBe('loaded');
    expect(app.candidates.map(c => c.name)).toEqual(['Ada']);
  });

  it('comes by itself for a signed-in manager, and is loading again after signing out', async () => {
    localStorage.setItem('resumate_hm_user', JSON.stringify({ name: 'Morgan', email: 'morgan@co.com' }));
    const getAll = vi.spyOn(candidatesAPI, 'getAll').mockResolvedValue({ data: { candidates: [ADA] } });
    render(<AppProvider><Probe /></AppProvider>);
    await waitFor(() => expect(app.candidatesStatus).toBe('loaded'));
    expect(getAll).toHaveBeenCalled();

    // The next manager's empty desk mustn't show before their own list has come.
    act(() => { app.logoutHiringManager(); });
    expect(app.candidates).toEqual([]);
    expect(app.candidatesStatus).toBe('loading');
  });
});
