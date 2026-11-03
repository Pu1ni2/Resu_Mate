import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

import { AppProvider, useApp } from './AppContext';
import { candidatesAPI } from '../services/api';

/* The candidate list was downloaded twice on every page load: the dashboard
 * asked as it opened, and so did the context for a signed-in manager. One
 * request runs at a time now, shared by whoever asks while it does, and a
 * list still coming when the manager signs out is theirs, never the next's. */

const ADA = { id: 1, name: 'Ada', skills: [] };
const BEA = { id: 2, name: 'Bea', skills: [] };

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
  render(<AppProvider><Probe /></AppProvider>);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('asking for the candidate list', () => {
  it('sends one request while one runs, for everyone who asks', async () => {
    const reply = later();
    const getAll = vi.spyOn(candidatesAPI, 'getAll').mockReturnValue(reply.promise);
    let first;
    let second;
    act(() => { first = app.loadCandidates(); second = app.loadCandidates(); });
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    await act(async () => { reply.resolve({ data: { candidates: [ADA] } }); await first; });
    expect(app.candidates.map(c => c.name)).toEqual(['Ada']);
  });

  it('sends another once that one is done, or failed', async () => {
    const getAll = vi.spyOn(candidatesAPI, 'getAll')
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue({ data: { candidates: [ADA] } });
    await act(async () => { await app.loadCandidates(); });
    expect(app.candidatesStatus).toBe('failed');
    await act(async () => { await app.loadCandidates(); });
    await act(async () => { await app.loadCandidates(); });
    expect(getAll).toHaveBeenCalledTimes(3);
    expect(app.candidates.map(c => c.name)).toEqual(['Ada']);
  });

  it("doesn't give the next manager the list still coming for the last", async () => {
    const theirs = later();
    const getAll = vi.spyOn(candidatesAPI, 'getAll')
      .mockReturnValueOnce(theirs.promise)
      .mockResolvedValueOnce({ data: { candidates: [BEA] } });
    let stale;
    act(() => { stale = app.loadCandidates(); });
    act(() => { app.logoutHiringManager(); });
    // The next manager's list is asked for anew...
    await act(async () => { await app.loadCandidates(); });
    expect(getAll).toHaveBeenCalledTimes(2);
    expect(app.candidates.map(c => c.name)).toEqual(['Bea']);
    // ...and the last one's, coming late, isn't shown.
    await act(async () => { theirs.resolve({ data: { candidates: [ADA] } }); await stale; });
    expect(app.candidates.map(c => c.name)).toEqual(['Bea']);
    expect(app.loading).toBe(false);
  });
});
