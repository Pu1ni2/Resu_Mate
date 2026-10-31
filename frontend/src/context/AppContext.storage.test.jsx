import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

import { AppProvider, useApp } from './AppContext';
import { candidatesAPI } from '../services/api';

/* The manager's candidate list, résumé text and all, was copied to the
 * browser's storage and read back when the app started, so it stayed for
 * anyone at that browser after the manager had gone. */

const ADA = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', skills: [], raw_text: 'Ada wrote the first program for the Analytical Engine.' };
const GRACE = { id: 2, name: 'Grace Hopper', email: 'grace@example.com', skills: [], raw_text: 'Grace wrote the first compiler.' };

let app;
function Probe() {
  app = useApp();
  return null;
}

// Everything this browser keeps, as one string.
const stored = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i))).join('\n');

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the manager's candidates", () => {
  it('are kept nowhere in the browser once loaded, nor after a delete', async () => {
    vi.spyOn(candidatesAPI, 'getAll').mockResolvedValue({ data: { candidates: [ADA, GRACE] } });
    vi.spyOn(candidatesAPI, 'delete').mockResolvedValue({ data: {} });
    render(<AppProvider><Probe /></AppProvider>);
    await act(async () => { await app.loadCandidates(); });
    expect(app.candidates).toHaveLength(2);
    expect(stored()).not.toMatch(/Ada|Grace|Analytical Engine|compiler|@example\.com/);

    await act(async () => { await app.deleteCandidate(2); });
    expect(app.candidates.map(c => c.name)).toEqual(['Ada Lovelace']);
    expect(stored()).not.toMatch(/Ada|Grace|Analytical Engine|compiler|@example\.com/);
  });

  it('are not taken from a copy an earlier version left, which goes when the app starts', () => {
    localStorage.setItem('resumate_candidates', JSON.stringify([ADA, GRACE]));
    render(<AppProvider><Probe /></AppProvider>);
    expect(app.candidates).toEqual([]);
    expect(localStorage.getItem('resumate_candidates')).toBeNull();
  });
});
