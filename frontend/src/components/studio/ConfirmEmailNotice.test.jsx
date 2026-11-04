import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

import ConfirmEmailNotice from './ConfirmEmailNotice';
import { AppProvider } from '../../context/AppContext';
import { accountAPI, candidatesAPI } from '../../services/api';

/* Until a new manager confirms their email they can't email candidates. The
 * workspace says so, with a way to get a new link, and stops once it's done,
 * here or on another device. */

const MORGAN = { id: 7, name: 'Morgan', email: 'morgan@co.com', email_verified: false };

async function open(user) {
  localStorage.setItem('resumate_hm_token', 'jwt');
  localStorage.setItem('resumate_hm_user', JSON.stringify(user));
  await act(async () => { render(<AppProvider><ConfirmEmailNotice /></AppProvider>); });
}

const notice = () => screen.queryByRole('region', { name: 'Confirm your email' });

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(candidatesAPI, 'getAll').mockResolvedValue({ data: { candidates: [] } });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('the reminder to confirm the email', () => {
  it("isn't there once the address is confirmed, nor for accounts from before", async () => {
    const me = vi.spyOn(accountAPI, 'me');
    await open({ ...MORGAN, email_verified: true });
    expect(notice()).toBeNull();
    // A sign-in kept from before the account said either way.
    const { email_verified: _unsaid, ...before } = MORGAN;
    localStorage.clear();
    await open(before);
    expect(notice()).toBeNull();
    expect(me).not.toHaveBeenCalled();
  });

  it('tells a new manager why, and sends a new link', async () => {
    vi.spyOn(accountAPI, 'me').mockResolvedValue({ data: MORGAN });
    const send = vi.spyOn(accountAPI, 'sendVerification')
      .mockResolvedValue({ data: { message: 'We’ve sent a new link to morgan@co.com.' } });
    await open(MORGAN);
    expect(notice().textContent).toContain('Confirm your email to send invitations.');
    expect(notice().textContent).toContain('We sent a link to morgan@co.com when you signed up.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send a new link' })); });
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('We’ve sent a new link to morgan@co.com.');
  });

  it('goes once the address was confirmed somewhere else', async () => {
    vi.spyOn(accountAPI, 'me').mockResolvedValue({ data: { ...MORGAN, email_verified: true } });
    await open(MORGAN);
    expect(notice()).toBeNull();
    expect(JSON.parse(localStorage.getItem('resumate_hm_user')).email_verified).toBe(true);
  });

  it('offers the link itself in development, where no email is sent', async () => {
    vi.spyOn(accountAPI, 'me').mockResolvedValue({ data: MORGAN });
    vi.spyOn(accountAPI, 'sendVerification').mockResolvedValue({
      data: { message: 'We’ve sent a new link to morgan@co.com.', debug_verify_link: 'http://localhost:3000/hiring/verify-email?token=t' },
    });
    await open(MORGAN);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send a new link' })); });
    expect(screen.getByRole('link', { name: 'Open the link (development)' }).getAttribute('href'))
      .toBe('http://localhost:3000/hiring/verify-email?token=t');
  });

  it('says so when no new link can be sent yet', async () => {
    vi.spyOn(accountAPI, 'me').mockResolvedValue({ data: MORGAN });
    vi.spyOn(accountAPI, 'sendVerification').mockRejectedValue({ response: { status: 429, data: { error: 'Rate limit exceeded: 3 per 1 hour' } } });
    await open(MORGAN);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send a new link' })); });
    expect(screen.getByRole('status').textContent).toBe('Too many attempts. Please wait an hour and try again.');
  });
});
