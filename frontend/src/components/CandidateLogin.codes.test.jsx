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
    expect(await screen.findByText('If the address has been invited, a new code is on its way, and the one before no longer works.')).toBeTruthy();
    expect(sent).toEqual(['dana@x.com', 'dana@x.com']);
    expect(screen.getByRole('textbox', { name: 'Access code' }).value).toBe('');
    expect(screen.queryByText(USED_UP)).toBeNull();
  });

  it('says nothing about a new code the first time', async () => {
    await atTheCodeStep();
    expect(screen.queryByText(/a new code is on its way/)).toBeNull();
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

/* The page is a real form now, on both steps, in the Studio design. */
const render1 = () => render(<MemoryRouter><AppProvider><CandidateLogin /></AppProvider></MemoryRouter>);
const emailBox = () => screen.getByRole('textbox', { name: 'Email address' });

describe('the email step', () => {
  it('is a form, so Enter sends the code', async () => {
    render1();
    fireEvent.change(emailBox(), { target: { value: 'dana@x.com' } });
    fireEvent.submit(emailBox().closest('form'));
    expect(await screen.findByRole('textbox', { name: 'Access code' })).toBeTruthy();
    expect(sent).toEqual(['dana@x.com']);
  });

  it('wants an address that looks like one, before asking the server', () => {
    render1();
    fireEvent.click(screen.getByRole('button', { name: 'Send access code' }));
    expect(screen.getByRole('alert').textContent).toMatch('Please enter your email address.');
    expect(document.activeElement).toBe(emailBox());
    fireEvent.change(emailBox(), { target: { value: 'dana@x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send access code' }));
    expect(screen.getByRole('alert').textContent).toMatch('Enter a valid email address, such as you@example.com.');
    expect(sent).toEqual([]);
  });

  it("announces the server's answer for an address it doesn't know", async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false, status: 404,
      json: async () => ({ detail: 'No interview access found for this email. Please check with your hiring manager.' }),
    });
    render1();
    fireEvent.change(emailBox(), { target: { value: 'nobody@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send access code' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/No interview access found for this email/);
  });

  it('offers a way to ask for data to be deleted', () => {
    render1();
    expect(screen.getByRole('link', { name: 'Request deletion' }).getAttribute('href')).toBe('/privacy/delete');
  });
});

describe('the code step, in the Studio design', () => {
  it('says where the code went, and puts the keyboard on its heading', async () => {
    await atTheCodeStep();
    const heading = screen.getByRole('heading', { name: 'Check your inbox.' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText(/has been invited to an interview/).textContent)
      .toMatch('If dana@x.com has been invited to an interview, we’ve emailed it a code.');
  });

  it('wants all six digits before checking the code', async () => {
    fireEvent.change(await atTheCodeStep(), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    expect(screen.getByRole('alert').textContent).toMatch('Enter the complete 6-digit access code.');
    expect(globalThis.fetch.mock.calls.some(([url]) => String(url).endsWith('/verify-otp'))).toBe(false);
  });

  it('goes back to the email step, with the keyboard on its heading', async () => {
    await atTheCodeStep();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your next chapter.' }));
    expect(emailBox().value).toBe('Dana@X.com');
  });
});
