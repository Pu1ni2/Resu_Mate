import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

import { AppProvider, useApp } from './AppContext';
import { accountAPI, candidatesAPI } from '../services/api';
import { readStoredUser } from '../services/session';
import { TOAST_EVENT } from '../services/notify';

/* "Hide names" is kept on the account, so the server keeps candidates' names
 * from the AI by it too. It was the page's alone, and off again after every
 * reload. */

const MORGAN = { id: 7, name: 'Morgan', email: 'morgan@co.com', hide_names: false };
const RILEY = { id: 8, name: 'Riley', email: 'riley@co.com', hide_names: true };

let app;
function Probe() {
  app = useApp();
  return null;
}

// A reply that comes, or fails, when the test says.
function later() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

let toasts;
const onToast = e => toasts.push(e.detail);

async function start(user) {
  if (user) {
    localStorage.setItem('resumate_hm_token', 'jwt');
    localStorage.setItem('resumate_hm_user', JSON.stringify(user));
  }
  await act(async () => { render(<AppProvider><Probe /></AppProvider>); });
}

beforeEach(() => {
  localStorage.clear();
  toasts = [];
  window.addEventListener(TOAST_EVENT, onToast);
  // A signed-in manager's list is asked for as the page opens.
  vi.spyOn(candidatesAPI, 'getAll').mockResolvedValue({ data: { candidates: [] } });
});

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, onToast);
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Hide names', () => {
  it('starts as the account has it', async () => {
    await start({ ...MORGAN, hide_names: true });
    expect(app.anonymize).toBe(true);
  });

  it("is each manager's own as they sign in, and off once they sign out", async () => {
    await start(null);
    expect(app.anonymize).toBe(false);
    await act(async () => { app.loginHiringManager('jwt', 'refresh', RILEY); });
    expect(app.anonymize).toBe(true);
    act(() => { app.logoutHiringManager(); });
    expect(app.anonymize).toBe(false);
  });

  it('is kept on the account when switched', async () => {
    await start(MORGAN);
    const save = vi.spyOn(accountAPI, 'savePreferences').mockResolvedValue({ data: { ...MORGAN, hide_names: true } });
    await act(async () => { await app.setAnonymize(true); });
    expect(save).toHaveBeenCalledWith({ hide_names: true });
    expect(app.anonymize).toBe(true);
    // So it's still on after a reload.
    expect(readStoredUser()).toMatchObject({ id: 7, hide_names: true });
    expect(toasts).toEqual([]);
  });

  it("moves back, and says so, when the account can't keep it", async () => {
    await start(MORGAN);
    vi.spyOn(accountAPI, 'savePreferences').mockRejectedValue({ response: { status: 503, data: {} } });
    await act(async () => { await app.setAnonymize(true); });
    expect(app.anonymize).toBe(false);
    expect(readStoredUser().hide_names).toBe(false);
    expect(toasts).toEqual([expect.objectContaining({ type: 'error', message: 'Could not save "Hide names". Please try again.' })]);
  });

  it('moves at once, and takes no other change while it is saved', async () => {
    await start(MORGAN);
    const reply = later();
    const save = vi.spyOn(accountAPI, 'savePreferences').mockReturnValue(reply.promise);
    let saving;
    act(() => { saving = app.setAnonymize(true); });
    expect(app.anonymize).toBe(true);
    expect(app.hideNamesSaving).toBe(true);
    act(() => { app.setAnonymize(false); });
    expect(app.anonymize).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { reply.resolve({ data: { ...MORGAN, hide_names: true } }); await saving; });
    expect(app.hideNamesSaving).toBe(false);
  });

  it("leaves the next manager's alone when the last one's save fails late", async () => {
    await start(MORGAN);
    const reply = later();
    vi.spyOn(accountAPI, 'savePreferences').mockReturnValue(reply.promise);
    let saving;
    act(() => { saving = app.setAnonymize(true); });
    act(() => { app.logoutHiringManager(); });
    await act(async () => { app.loginHiringManager('jwt', 'refresh', RILEY); });
    await act(async () => { reply.reject(new Error('Network Error')); await saving; });
    expect(app.anonymize).toBe(true);
    expect(readStoredUser()).toMatchObject({ id: 8, hide_names: true });
    expect(toasts).toEqual([]);
  });

  it("is the page's alone with no one signed in", async () => {
    await start(null);
    const save = vi.spyOn(accountAPI, 'savePreferences');
    await act(async () => { await app.setAnonymize(true); });
    expect(app.anonymize).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
});
