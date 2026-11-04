import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

import { AppProvider, useApp } from './AppContext';
import { candidatesAPI } from '../services/api';
import { readStoredUser } from '../services/session';

/* The signed-in manager's account, as the server sends it later, such as
 * once their email is confirmed: kept, for them only, without asking for the
 * candidate list again. */

const MORGAN = { id: 7, name: 'Morgan', email: 'morgan@co.com', email_verified: false };

let app;
function Probe() {
  app = useApp();
  return null;
}

let getAll;
beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('resumate_hm_token', 'jwt');
  localStorage.setItem('resumate_hm_user', JSON.stringify(MORGAN));
  getAll = vi.spyOn(candidatesAPI, 'getAll').mockResolvedValue({ data: { candidates: [] } });
  await act(async () => { render(<AppProvider><Probe /></AppProvider>); });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("refreshing the manager's account", () => {
  it('keeps what the server sent, and leaves the list as it is', async () => {
    expect(getAll).toHaveBeenCalledTimes(1);
    await act(async () => { app.refreshHiringManager({ ...MORGAN, email_verified: true }); });
    expect(app.hiringManager.email_verified).toBe(true);
    expect(readStoredUser().email_verified).toBe(true);
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it("isn't for another manager's account", async () => {
    await act(async () => { app.refreshHiringManager({ id: 8, name: 'Riley', email_verified: true }); });
    expect(app.hiringManager).toMatchObject({ id: 7, email_verified: false });
    expect(readStoredUser()).toMatchObject({ id: 7, email_verified: false });
  });

  it('still asks for the list when another manager signs in', async () => {
    await act(async () => { app.loginHiringManager('jwt2', 'refresh2', { id: 8, name: 'Riley' }); });
    expect(getAll).toHaveBeenCalledTimes(2);
  });
});
