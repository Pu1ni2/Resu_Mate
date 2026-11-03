import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider, useApp } from '../context/AppContext';
import { candidatesAPI } from '../services/api';
import Dashboard from './Dashboard';

/* A résumé upload's bar ran on a timer up to 90% under "Analyzing...",
 * whatever was happening. It shows what is: the file going up, with how
 * much, then the server reading it, which can't say how far along it is. */

let app;
function Probe() {
  app = useApp();
  return null;
}

// A reply that comes when the test says.
function later() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const stages = () => Object.values(app.uploadProgress);

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("an upload's stages", () => {
  it('go from the file going up, to the server reading it, to done', async () => {
    const reply = later();
    let sent;
    vi.spyOn(candidatesAPI, 'upload').mockImplementation((file, onSent) => { sent = onSent; return reply.promise; });
    render(<AppProvider><Probe /></AppProvider>);
    let upload;
    act(() => { upload = app.uploadResume(new File(['cv'], 'cv.pdf')); });
    expect(stages()).toEqual([{ stage: 'uploading', percent: 0 }]);
    act(() => sent(40));
    expect(stages()).toEqual([{ stage: 'uploading', percent: 40 }]);
    act(() => sent(100));
    expect(stages()).toEqual([{ stage: 'reading', percent: null }]);
    vi.useFakeTimers();
    await act(async () => { reply.resolve({ data: { id: 9, name: 'Ada' } }); await upload; });
    expect(stages()).toEqual([{ stage: 'done', percent: 100 }]);
    act(() => { vi.advanceTimersByTime(600); });
    expect(stages()).toEqual([]);
    expect(app.candidates.map(c => c.name)).toEqual(['Ada']);
  });

  it("say uploading without a figure when the browser can't tell how much", async () => {
    const reply = later();
    let sent;
    vi.spyOn(candidatesAPI, 'upload').mockImplementation((file, onSent) => { sent = onSent; return reply.promise; });
    render(<AppProvider><Probe /></AppProvider>);
    act(() => { app.uploadResume(new File(['cv'], 'cv.pdf')); });
    act(() => sent(null));
    expect(stages()).toEqual([{ stage: 'uploading', percent: null }]);
  });

  it('are cleared when the upload fails', async () => {
    vi.spyOn(candidatesAPI, 'upload').mockRejectedValue(new Error('Network Error'));
    render(<AppProvider><Probe /></AppProvider>);
    await act(async () => { await app.uploadResume(new File(['cv'], 'cv.pdf')).catch(() => {}); });
    expect(stages()).toEqual([]);
  });
});

describe("an upload's bar on the Candidates page", () => {
  it('says how much has gone up, then that the résumé is being read, with no figure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.spyOn(candidatesAPI, 'getAll').mockResolvedValue({ data: { candidates: [] } });
    let sent;
    vi.spyOn(candidatesAPI, 'upload').mockImplementation((file, onSent) => { sent = onSent; return new Promise(() => {}); });
    const { container } = render(
      <MemoryRouter initialEntries={['/hiring?view=upload']}>
        <AppProvider><Probe /><Dashboard /></AppProvider>
      </MemoryRouter>,
    );
    act(() => { app.uploadResume(new File(['cv'], 'cv.pdf')); });
    act(() => sent(40));
    const bar = () => container.querySelector('.sd-upload-bar');
    expect(screen.getByText('Uploading…')).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(bar().firstChild.style.width).toBe('40%');
    expect(bar().classList.contains('is-working')).toBe(false);
    act(() => sent(100));
    expect(screen.getByText('Reading the résumé…')).toBeTruthy();
    expect(screen.queryByText(/%$/)).toBeNull();
    expect(bar().classList.contains('is-working')).toBe(true);
    expect(screen.queryByText('Analyzing...')).toBeNull();
  });
});
