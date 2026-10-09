import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { resetFeatures } from '../../services/features';
import { TOAST_EVENT } from '../../services/notify';
import InterviewCreator from './InterviewCreator';

/* Creating an interview told the manager the candidate "can now log in", with
 * nothing sent to the candidate and no link to pass on. A refusal ended the
 * spinner without a word. */

const ADA = { id: 1, name: 'Ada Lovelace', predicted_role: 'Engineer' };
const LINK = 'https://resumate.example/candidate/login';

let sent;

function server(answer, { avatars = false } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    if (String(url).endsWith('/api/features')) {
      return { ok: true, status: 200, json: async () => ({ avatar_interviews: avatars }) };
    }
    sent = JSON.parse(options.body);
    const { status = 200, ...body } = answer;
    return { ok: status < 400, status, json: async () => body };
  });
}

const created = (extra = {}) => ({
  message: 'Interview created for ada@x.com',
  interview_config: { mode: 'conversational' },
  invite_sent: false, invite_error: null, portal_link: LINK,
  ...extra,
});

async function create({ untick = false, avatar = false } = {}) {
  render(<InterviewCreator focusCandidate={ADA} />);
  if (avatar) {
    const choice = screen.getByRole('button', { name: /avatar interview/i });
    await waitFor(() => expect(choice.disabled).toBe(false));
    fireEvent.click(choice);
  }
  fireEvent.change(screen.getByPlaceholderText('candidate@email.com'), { target: { value: 'ada@x.com' } });
  if (untick) fireEvent.click(screen.getByLabelText(/email the invitation/i));
  fireEvent.click(screen.getByRole('button', { name: /create interview/i }));
  await screen.findByText(/interview created!/i);
}

beforeEach(() => {
  resetFeatures();
  sent = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('creating an interview', () => {
  it('emails the invitation unless told not to', async () => {
    server(created({ invite_sent: true }));
    await create();
    expect(sent.send_invite).toBe(true);
    expect(screen.getByText(/invitation emailed to/i).textContent).toMatch(/ada@x\.com/);
    expect(screen.queryByLabelText(/candidate sign-in link/i)).toBeNull();
  });

  it('gives the link to send when nothing was emailed', async () => {
    server(created());
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await create({ untick: true });
    expect(sent.send_invite).toBe(false);
    expect(screen.getByLabelText(/candidate sign-in link/i).value).toBe(LINK);
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it('says why the invitation was not emailed', async () => {
    server(created({ invite_error: "Email isn't set up on this server. Share the portal link instead." }));
    await create();
    expect(screen.getByRole('status').textContent).toMatch(/isn't set up/);
    expect(screen.getByLabelText(/candidate sign-in link/i).value).toBe(LINK);
  });

  it('shows the kind of interview the server will run, not the one picked', async () => {
    server(created({ interview_config: { mode: 'conversational' } }), { avatars: true });
    await create({ avatar: true });
    expect(sent.mode).toBe('avatar');
    expect(screen.getByText(/voice conversation/i)).toBeTruthy();
  });

  it('says so when the server refuses', async () => {
    server({ status: 404, detail: 'Candidate not found' });
    const toasts = [];
    const listen = e => toasts.push(e.detail);
    window.addEventListener(TOAST_EVENT, listen);
    render(<InterviewCreator focusCandidate={ADA} />);
    fireEvent.change(screen.getByPlaceholderText('candidate@email.com'), { target: { value: 'ada@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: /create interview/i }));
    await waitFor(() => expect(toasts).toEqual([{ message: 'Candidate not found', type: 'error' }]));
    window.removeEventListener(TOAST_EVENT, listen);
    expect(screen.queryByText(/interview created!/i)).toBeNull();
  });
});
