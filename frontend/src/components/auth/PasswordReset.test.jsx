import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import HiringLogin from './HiringLogin';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import { AppProvider } from '../../context/AppContext';
import api from '../../services/api';

/* A manager who forgot their password had no way back into the account. */

const ANSWER = "If there's an account for that address, we've emailed it a link to reset the password.";

function at(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <Routes>
          <Route path="/hiring/login" element={<HiringLogin />} />
          <Route path="/hiring/forgot" element={<ForgotPassword />} />
          <Route path="/hiring/reset" element={<ResetPassword />} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  );
}

const refused = (status, detail) => {
  const err = new Error('request failed');
  err.response = { status, data: { detail } };
  return err;
};

function type(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(api, 'get').mockResolvedValue({ data: { candidates: [] } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('sign-in', () => {
  it('offers a way back for a forgotten password', () => {
    at('/hiring/login');
    fireEvent.click(screen.getByRole('link', { name: 'Forgot password?' }));
    expect(screen.getByRole('heading', { name: 'Forgot your password?' })).toBeTruthy();
  });
});

describe('asking for a link', () => {
  it("sends the address and shows the server's answer", async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: ANSWER } });
    at('/hiring/forgot');
    type(/^email$/i, ' jane@co.com ');
    fireEvent.click(screen.getByRole('button', { name: 'Email me a link' }));
    expect((await screen.findByRole('status')).textContent).toContain(ANSWER);
    expect(post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'jane@co.com' });
    expect(screen.queryByRole('button', { name: 'Email me a link' })).toBeNull();
    expect(screen.queryByText(/development/i)).toBeNull();
  });

  it('shows the link itself when a development server has no email', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { message: ANSWER, debug_reset_link: 'http://localhost:5173/hiring/reset?token=t' } });
    at('/hiring/forgot');
    type(/^email$/i, 'jane@co.com');
    fireEvent.click(screen.getByRole('button', { name: 'Email me a link' }));
    const link = await screen.findByRole('link', { name: /open the reset link/i });
    expect(link.getAttribute('href')).toBe('http://localhost:5173/hiring/reset?token=t');
  });
});

describe('choosing a new password', () => {
  it('sets it, and sign-in says so', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'Password changed.' } });
    at('/hiring/reset?token=tok-1');
    type(/^new password$/i, 'brand-new-pass');
    type(/^confirm new password$/i, 'brand-new-pass');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Password changed. Sign in with the new one.')).toBeTruthy();
    expect(post).toHaveBeenCalledWith('/auth/reset-password', { token: 'tok-1', password: 'brand-new-pass' });
  });

  it('checks the two match, and the length, before sending', async () => {
    const post = vi.spyOn(api, 'post');
    at('/hiring/reset?token=tok-1');
    type(/^new password$/i, 'brand-new-pass');
    type(/^confirm new password$/i, 'brand-new-pazz');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/do not match/i);
    type(/^new password$/i, 'short');
    type(/^confirm new password$/i, 'short');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/at least 8 characters/i));
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the server's reason for a used or expired link", async () => {
    vi.spyOn(api, 'post').mockRejectedValue(refused(400, 'This reset link has expired or was already used. Ask for a new one.'));
    at('/hiring/reset?token=old');
    type(/^new password$/i, 'brand-new-pass');
    type(/^confirm new password$/i, 'brand-new-pass');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/expired or was already used/);
    expect(screen.getByRole('link', { name: 'Ask for a new one' }).getAttribute('href')).toBe('/hiring/forgot');
  });

  it('needs the link from the email', () => {
    at('/hiring/reset');
    expect(screen.getByRole('alert').textContent).toMatch(/needs the link from the reset email/i);
    expect(screen.queryByLabelText(/^new password$/i)).toBeNull();
  });
});
