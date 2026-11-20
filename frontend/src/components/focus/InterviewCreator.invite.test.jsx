import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import { resetFeatures } from '../../services/features';
import { TOAST_EVENT } from '../../services/notify';
import InterviewCreator from './InterviewCreator';

/* Creating an interview told the manager the candidate "can now log in", with
 * nothing sent to the candidate and no link to pass on. A refusal ended the
 * spinner without a word. */

const ADA = { id: 1, name: 'Ada Lovelace', predicted_role: 'Engineer' };
const LINK = 'https://resumate.example/candidate/login';

let sent;
let asked;  // how often the page asked after the invitation

/* The server: create-interview answers `answer`; GET /api/emails answers
 * each of `emails` in turn, the last again once they run out. */
function server(answer, { avatars = false, emails = [] } = {}) {
  asked = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    if (String(url).endsWith('/api/features')) {
      return { ok: true, status: 200, json: async () => ({ avatar_interviews: avatars }) };
    }
    if (String(url).includes('/api/emails?ids=')) {
      asked += 1;
      const now = emails[Math.min(asked, emails.length) - 1];
      return { ok: true, status: 200, json: async () => ({ emails: [now] }) };
    }
    sent = JSON.parse(options.body);
    const { status = 200, ...body } = answer;
    return { ok: status < 400, status, json: async () => body };
  });
}

const created = (extra = {}) => ({
  message: 'Interview created for ada@x.com',
  interview_config: { mode: 'conversational' },
  invite: null, portal_link: LINK,
  ...extra,
});
const QUEUED = { email_id: 5, status: 'queued', error: null };
const email = (status, error = null) => ({ id: 5, kind: 'interview_invitation', interview_id: 7, status, error });

async function create({ untick = false, avatar = false, following = false } = {}) {
  render(<InterviewCreator focusCandidate={ADA} />);
  if (avatar) {
    const choice = screen.getByRole('button', { name: /avatar interview/i });
    await waitFor(() => expect(choice.disabled).toBe(false));
    fireEvent.click(choice);
  }
  fireEvent.change(screen.getByPlaceholderText('candidate@email.com'), { target: { value: 'ada@x.com' } });
  if (untick) fireEvent.click(screen.getByLabelText(/email the invitation/i));
  if (following) {
    // The page asks after its invitation on a timer, set as the answer comes:
    // the tests' own clock from before then.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /create interview/i })); });
    expect(screen.getByText(/interview created!/i)).toBeTruthy();
    return;
  }
  fireEvent.click(screen.getByRole('button', { name: /create interview/i }));
  await screen.findByText(/interview created!/i);
}

beforeEach(() => {
  resetFeatures();
  sent = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('creating an interview', () => {
  it('emails the invitation unless told not to, saying when it has gone', async () => {
    server(created({ invite: QUEUED }), { emails: [email('queued'), email('sent')] });
    await create({ following: true });
    expect(sent.send_invite).toBe(true);
    // Queued: the server's outbox sends it a moment later.
    expect(screen.getByRole('status').textContent).toMatch(/sending the invitation to ada@x\.com/i);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(screen.getByRole('status').textContent).toMatch(/invitation emailed to ada@x\.com/i);
    expect(screen.queryByLabelText(/candidate sign-in link/i)).toBeNull();
    // It has gone: asked after no more.
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(asked).toBe(2);
  });

  it('says why the invitation was not emailed', async () => {
    server(created({ invite: { email_id: null, status: 'refused', error: "Email isn't set up on this server. Share the portal link instead." } }));
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

describe("the new interview's questions", () => {
  // The interview was created without saying what would be asked.
  const QUESTIONS = ['How do you size partitions?', 'Tell me about a hard bug.'];
  let edited;

  const questionsServer = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/api/features')) return { ok: true, status: 200, json: async () => ({ avatar_interviews: false }) };
    if (path.endsWith('/api/chat/interviews/7/questions')) {
      edited = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ interview_id: 7, questions: edited.questions }) };
    }
    return { ok: true, status: 200, json: async () => created({ interview_config: { mode: 'conversational', interview_id: 7, questions: QUESTIONS } }) };
  });

  beforeEach(() => { edited = null; });

  it('lists what the interviewer will ask', async () => {
    questionsServer();
    await create({ untick: true });
    const questions = screen.getByRole('region', { name: 'Interview questions' });
    expect([...questions.querySelectorAll('li')].map(li => li.textContent)).toEqual(QUESTIONS);
  });

  it('saves the questions as the manager edits them, one a line', async () => {
    questionsServer();
    await create({ untick: true });
    fireEvent.click(screen.getByRole('button', { name: 'Edit questions' }));
    fireEvent.change(screen.getByLabelText(/one question a line/i), { target: { value: 'What do you rely on?\n\n  Why that?  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    await waitFor(() => expect(edited).toEqual({ questions: ['What do you rely on?', 'Why that?'] }));
    const questions = screen.getByRole('region', { name: 'Interview questions' });
    await waitFor(() => expect([...questions.querySelectorAll('li')].map(li => li.textContent)).toEqual(['What do you rely on?', 'Why that?']));
  });
});
