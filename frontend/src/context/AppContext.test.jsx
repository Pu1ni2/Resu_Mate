import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

import { AppProvider, useApp } from './AppContext';
import { candidatesAPI } from '../services/api';
import { TOAST_EVENT } from '../services/notify';

/* A delete that the server refused used to look like one that worked: the
 * candidates left the list either way, and came back on the next reload. */

const ADA = { id: 1, name: 'Ada', skills: [] };
const GRACE = { id: 2, name: 'Grace', skills: [] };

let app;
function Probe() {
  app = useApp();
  return null;
}

let toasts;
const onToast = e => toasts.push(e.detail);

function refusal(status, detail) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: detail ? { detail } : {} },
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('resumate_candidates', JSON.stringify([ADA, GRACE]));
  toasts = [];
  window.addEventListener(TOAST_EVENT, onToast);
  render(<AppProvider><Probe /></AppProvider>);
});

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, onToast);
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Delete All', () => {
  it('keeps the list and says why when the server refuses', async () => {
    vi.spyOn(candidatesAPI, 'deleteAll').mockRejectedValue(refusal(500, 'Database unavailable'));
    let result;
    await act(async () => { result = await app.clearAllCandidates(); });
    expect(result).toBe(false);
    expect(app.candidates.map(c => c.name)).toEqual(['Ada', 'Grace']);
    expect(app.deleting).toBe(false);
    expect(toasts).toEqual([{ message: 'Database unavailable', type: 'error' }]);
  });

  it('empties the list once the server has deleted them', async () => {
    vi.spyOn(candidatesAPI, 'deleteAll').mockResolvedValue({ data: {} });
    let result;
    await act(async () => { result = await app.clearAllCandidates(); });
    expect(result).toBe(true);
    expect(app.candidates).toEqual([]);
    expect(JSON.parse(localStorage.getItem('resumate_candidates') || '[]')).toEqual([]);
    expect(toasts).toEqual([]);
  });
});

describe('deleting one candidate', () => {
  it('keeps them and says why when the server refuses', async () => {
    vi.spyOn(candidatesAPI, 'delete').mockRejectedValue(refusal(500));
    let result;
    await act(async () => { result = await app.deleteCandidate(1); });
    expect(result).toBe(false);
    expect(app.candidates.map(c => c.name)).toEqual(['Ada', 'Grace']);
    expect(toasts).toEqual([{ message: 'Could not delete the candidate. Please try again.', type: 'error' }]);
    // Left true, the Delete All dialog would open stuck on "Deleting…".
    expect(app.deleting).toBe(false);
  });

  it('removes them when the server says they are already gone', async () => {
    vi.spyOn(candidatesAPI, 'delete').mockRejectedValue(refusal(404, 'Candidate not found'));
    let result;
    await act(async () => { result = await app.deleteCandidate(1); });
    expect(result).toBe(true);
    expect(app.candidates.map(c => c.name)).toEqual(['Grace']);
    expect(toasts).toEqual([]);
  });

  it('says so when the server cannot be reached', async () => {
    vi.spyOn(candidatesAPI, 'delete').mockRejectedValue(new Error('Network Error'));
    await act(async () => { await app.deleteCandidate(2); });
    expect(app.candidates.map(c => c.name)).toEqual(['Ada', 'Grace']);
    expect(toasts[0].message).toBe('Could not reach the server. Please check your connection.');
  });
});
