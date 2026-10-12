import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import CandidateLogin from './CandidateLogin';

/* Five wrong guesses use a sign-in code up, and the server says to ask for a new
 * one. The code step had no way to: only "Use a different email", which went
 * back to the start. */

const USED_UP = 'That code was tried too many times, so it no longer works. Ask for a new one.';

let sent;

beforeEach(() => {
  localStorage.clear();
  sent = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    if (String(url).endsWith('/api/auth/candidate/send-otp')) {
      sent.push(JSON.parse(options.body).email);
      return { ok: true, status: 200, json: async () => ({ message: 'OTP sent to your email' }) };
    }
    if (String(url).endsWith('/api/auth/candidate/verify-otp')) {
      return { ok: false, status: 400, json: async () => ({ detail: USED_UP }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function atTheCodeStep() {
  render(<MemoryRouter><AppProvider><CandidateLogin /></AppProvider></MemoryRouter>);
  fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'Dana@X.com' } });
  fireEvent.click(screen.getByRole('button', { name: /send access code/i }));
  return screen.findByRole('textbox', { name: 'Access code' });
}

describe('the code step', () => {
  it('shows why a code was refused', async () => {
    fireEvent.change(await atTheCodeStep(), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
    expect(await screen.findByText(USED_UP)).toBeTruthy();
  });

  it('sends a new code to the same address, and says so', async () => {
    const box = await atTheCodeStep();
    fireEvent.change(box, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
    await screen.findByText(USED_UP);

    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByText('We sent a new code. The one before no longer works.')).toBeTruthy();
    expect(sent).toEqual(['dana@x.com', 'dana@x.com']);
    expect(screen.getByRole('textbox', { name: 'Access code' }).value).toBe('');
    expect(screen.queryByText(USED_UP)).toBeNull();
  });

  it('says nothing about a new code the first time', async () => {
    await atTheCodeStep();
    expect(screen.queryByText(/We sent a new code/)).toBeNull();
  });

  it('says to wait when there were too many tries, not that the code is wrong', async () => {
    const box = await atTheCodeStep();
    globalThis.fetch.mockResolvedValueOnce({
      ok: false, status: 429, json: async () => ({ error: 'Rate limit exceeded: 5 per 1 minute' }),
    });
    fireEvent.change(box, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
    expect(await screen.findByText('Too many attempts. Please wait a minute and try again.')).toBeTruthy();
    expect(screen.queryByText(/Invalid or expired/)).toBeNull();
  });
});
