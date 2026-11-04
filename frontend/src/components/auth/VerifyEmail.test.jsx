import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import VerifyEmail from './VerifyEmail';
import { accountAPI } from '../../services/api';

/* The page the link in the sign-up email opens. It confirms the manager's
 * address, signed in or not, and says what to do when the link won't. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../../context/AppContext', () => ({ useApp: () => mocks.app }));

const MORGAN = { id: 7, name: 'Morgan', email: 'morgan@co.com', email_verified: false };

async function open(path, { signedIn = true } = {}) {
  mocks.app = { hiringManager: signedIn ? MORGAN : null, refreshHiringManager: vi.fn() };
  await act(async () => {
    render(
      // As in development, which runs an effect twice.
      <React.StrictMode>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/hiring/verify-email" element={<VerifyEmail />} />
          </Routes>
        </MemoryRouter>
      </React.StrictMode>,
    );
  });
  return mocks.app;
}

beforeEach(() => {
  document.title = 'ResuMate';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the link from the sign-up email', () => {
  it('confirms the address, once, and leads back to the workspace', async () => {
    const confirmed = { ...MORGAN, email_verified: true };
    const verify = vi.spyOn(accountAPI, 'verifyEmail').mockResolvedValue({ data: { user: confirmed } });
    const app = await open('/hiring/verify-email?token=abc');
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith('abc');
    expect(screen.getByRole('heading', { name: 'Your email is confirmed.' })).toBeTruthy();
    expect(screen.getByText('You can email candidates from your workspace now.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to your workspace' }).getAttribute('href')).toBe('/hiring');
    // So the workspace stops asking for it.
    expect(app.refreshHiringManager).toHaveBeenCalledWith(confirmed);
  });

  it('works where no one is signed in, and leads to sign in', async () => {
    vi.spyOn(accountAPI, 'verifyEmail').mockResolvedValue({ data: { user: { ...MORGAN, email_verified: true } } });
    await open('/hiring/verify-email?token=abc', { signedIn: false });
    expect(screen.getByRole('heading', { name: 'Your email is confirmed.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/hiring/login');
  });

  it('says so when the link has expired, and where a new one comes from', async () => {
    vi.spyOn(accountAPI, 'verifyEmail').mockRejectedValue({
      response: { status: 400, data: { detail: "This link has expired or isn't valid." } },
    });
    await open('/hiring/verify-email?token=old');
    expect(screen.getByRole('alert').textContent).toContain("This link has expired or isn't valid.");
    expect(screen.getByRole('link', { name: 'Send a new link from your workspace' }).getAttribute('href')).toBe('/hiring');
  });

  it('needs the link from the email, and asks for nothing without it', async () => {
    const verify = vi.spyOn(accountAPI, 'verifyEmail');
    await open('/hiring/verify-email', { signedIn: false });
    expect(screen.getByText('This page needs the link from the email we sent when you signed up.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(verify).not.toHaveBeenCalled();
  });
});
