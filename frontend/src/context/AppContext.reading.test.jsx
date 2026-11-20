import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

import { AppProvider, useApp } from './AppContext';
import { candidatesAPI } from '../services/api';

/* A résumé is read by the AI after its upload has answered, so a candidate is
 * "pending" for a while: the app asks after them, and shows them as soon as
 * they've been read. */

const ADA = { id: 1, name: 'Ada', skills: [], analysis_status: 'pending', predicted_role: null };
const ADA_READ = { ...ADA, analysis_status: 'done', predicted_role: 'Engineer' };
const BEA = { id: 2, name: 'Bea', skills: [], analysis_status: 'done', predicted_role: 'Analyst' };

let app;
function Probe() {
  app = useApp();
  return null;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

const who = () => app.candidates.map(c => [c.name, c.analysis_status, c.predicted_role]);

describe('a candidate whose résumé is being read', () => {
  it('is asked after, and shown once read, alone of the list', async () => {
    vi.spyOn(candidatesAPI, 'getAll').mockResolvedValue({ data: { candidates: [ADA, BEA] } });
    const getOne = vi.spyOn(candidatesAPI, 'getOne')
      .mockResolvedValueOnce({ data: ADA })
      .mockResolvedValueOnce({ data: ADA_READ });
    render(<AppProvider><Probe /></AppProvider>);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => { await app.loadCandidates(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(who()).toEqual([['Ada', 'pending', null], ['Bea', 'done', 'Analyst']]);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(who()).toEqual([['Ada', 'done', 'Engineer'], ['Bea', 'done', 'Analyst']]);
    // Read: asked after no more.
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(getOne.mock.calls.map(([id]) => id)).toEqual([1, 1]);
  });

  it("is an upload's, read after the upload has answered", async () => {
    vi.spyOn(candidatesAPI, 'upload').mockResolvedValue({ data: ADA });
    vi.spyOn(candidatesAPI, 'getOne').mockResolvedValue({ data: ADA_READ });
    render(<AppProvider><Probe /></AppProvider>);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => { await app.uploadResume(new File(['Ada'], 'ada.txt', { type: 'text/plain' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(who()).toEqual([['Ada', 'pending', null]]);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(who()).toEqual([['Ada', 'done', 'Engineer']]);
  });

  it('is asked after no more once the manager signs out', async () => {
    vi.spyOn(candidatesAPI, 'getAll').mockResolvedValue({ data: { candidates: [ADA] } });
    const getOne = vi.spyOn(candidatesAPI, 'getOne').mockResolvedValue({ data: ADA });
    render(<AppProvider><Probe /></AppProvider>);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => { await app.loadCandidates(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(getOne).toHaveBeenCalledTimes(1);
    act(() => { app.logoutHiringManager(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(getOne).toHaveBeenCalledTimes(1);
    expect(app.candidates).toEqual([]);
  });
});
