import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import { resetFeatures } from '../../services/features';
import { NOTIFY_EVENT, TOAST_EVENT } from '../../services/notify';
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

  it('says why when the invitation couldn’t go after all, with the link to share', async () => {
    server(created({ invite: QUEUED }), { emails: [email('failed', 'The email service refused it.')] });
    await create({ following: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByRole('status').textContent).toBe('The email service refused it.');
    expect(screen.getByLabelText(/candidate sign-in link/i).value).toBe(LINK);
  });

  it('gives the link to send when nothing was emailed', async () => {
    server(created());
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const toasts = [];
    const listen = e => toasts.push(e.detail.message);
    window.addEventListener(TOAST_EVENT, listen);
    try {
      await create({ untick: true });
    } finally {
      window.removeEventListener(TOAST_EVENT, listen);
    }
    expect(toasts).toEqual(['Interview created. Send the candidate the sign-in link.']);
    expect(sent.send_invite).toBe(false);
    expect(screen.getByLabelText(/candidate sign-in link/i).value).toBe(LINK);
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(LINK);
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

/* The questions are written in the background, a moment after the interview
 * is made, and its invitation waits for them. */
describe('questions written in the background', () => {
  const WRITTEN = ['How do you size partitions?', 'Tell me about a hard bug.'];
  let interviews;  // each answer about the interview, the last again once they run out
  let askedInterview;

  function backgroundServer({ invite = null, emails = [] } = {}) {
    asked = 0;
    askedInterview = 0;
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
      const path = String(url);
      const ok = body => ({ ok: true, status: 200, json: async () => body });
      if (path.endsWith('/api/features')) return ok({ avatar_interviews: false });
      if (path.includes('/api/emails?ids=')) {
        asked += 1;
        return ok({ emails: [emails[Math.min(asked, emails.length) - 1]] });
      }
      if (path.endsWith('/api/chat/interviews/7/questions')) {
        return ok({ interview_id: 7, questions: JSON.parse(options.body).questions, questions_status: 'ready' });
      }
      if (path.endsWith('/api/chat/interviews/7')) {
        askedInterview += 1;
        return ok(interviews.length > 1 ? interviews.shift() : interviews[0]);
      }
      return ok(created({ invite, interview_config: {
        mode: 'conversational', interview_id: 7, questions: [], questions_status: 'pending' } }));
    });
  }

  const listed = () => [...screen.getByRole('region', { name: 'Interview questions' }).querySelectorAll('li')]
    .map(li => li.textContent);

  it('says they are being written, then lists them', async () => {
    interviews = [{ questions_status: 'pending', questions: [] }, { questions_status: 'ready', questions: WRITTEN }];
    backgroundServer();
    await create({ untick: true, following: true });
    expect(screen.getByText(/writing the questions for this candidate/i)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByText(/writing the questions for this candidate/i)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(listed()).toEqual(WRITTEN);
    // Written: asked after no more.
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(askedInterview).toBe(2);
  });

  it('says the invitation goes once they are written, then that it has', async () => {
    interviews = [{ questions_status: 'ready', questions: WRITTEN }];
    backgroundServer({ invite: { email_id: 5, status: 'held', error: null }, emails: [email('held'), email('sent')] });
    const said = [];
    const listen = e => said.push(e.detail.message || e.detail.body);
    window.addEventListener(TOAST_EVENT, listen);
    window.addEventListener(NOTIFY_EVENT, listen);
    try {
      await create({ following: true });
    } finally {
      window.removeEventListener(TOAST_EVENT, listen);
      window.removeEventListener(NOTIFY_EVENT, listen);
    }
    expect(said).toEqual(['Interview created. The invitation goes once its questions are written.',
                          'The invitation goes to ada@x.com once the questions are written']);
    const statuses = () => screen.getAllByRole('status').map(s => s.textContent).join(' | ');
    expect(statuses()).toMatch(/the invitation goes to ada@x\.com once the questions are written\./i);
    expect(statuses()).not.toMatch(/sending/i);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(statuses()).toMatch(/invitation emailed to ada@x\.com/i);
  });

  it('says when none could be written, so Alex asks general ones', async () => {
    interviews = [{ questions_status: 'failed', questions: [] }];
    backgroundServer();
    await create({ untick: true, following: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.queryByText(/writing the questions/i)).toBeNull();
    expect(screen.getByText(/no questions could be made for this candidate/i)).toBeTruthy();
  });

  it("keeps the manager's own, written meanwhile, and asks after the others no more", async () => {
    interviews = [{ questions_status: 'pending', questions: [] }];
    backgroundServer();
    await create({ untick: true, following: true });
    fireEvent.click(screen.getByRole('button', { name: 'Edit questions' }));
    fireEvent.change(screen.getByLabelText(/one question a line/i), { target: { value: 'Mine?' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save questions' })); });
    expect(listed()).toEqual(['Mine?']);
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(askedInterview).toBe(0);
    expect(listed()).toEqual(['Mine?']);
  });
});
