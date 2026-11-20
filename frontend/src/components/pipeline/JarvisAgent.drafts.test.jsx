import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';

import JarvisAgent from './JarvisAgent';

/* Jarvis's invitation drafts, one per candidate. Only the first showed, and
 * none could be changed before Send emailed them all. */

vi.mock('../../hooks/useVoice', () => ({
  default: () => ({
    isRecording: false, isTranscribing: false, speakingMsgIndex: null,
    speakText: async () => {}, startRecording: () => {}, stopRecording: () => {}, stopSpeaking: () => {},
  }),
}));

const ok = body => ({ ok: true, status: 200, json: async () => body });
const outcome = (id, name) => ({
  candidate_id: id, name, email: `${name.toLowerCase()}@x.com`, interview_created: true, interview_id: id * 10,
  email_subject: 'Interview with us', email_body: `Dear ${name}, we would like to talk.`, email_sent: false,
});
const PEOPLE = [{ id: 7, name: 'Dana', email: 'dana@x.com' }, { id: 8, name: 'Eli', email: 'eli@x.com' }];

let calls;

beforeEach(() => {
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  calls = [];
  const replies = [{ reply: 'I can set that up.', action: 'batch_action', action_params: { candidate_ids: [7, 8], role: 'Dev' } }];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const path = String(url).replace(/^.*?\/api\//, '/api/');
    calls.push({ path, body: options.body ? JSON.parse(options.body) : null });
    if (path === '/api/jarvis/chat') return ok(replies.shift() || { reply: 'Okay.', action: null });
    if (path === '/api/pipeline/batches') {
      return ok({ batch_id: 1, finished: true, total: 2, interviews_created: 2, emails_sent: 0, portal_link: 'https://resumate.example/candidate/login', outcomes: [outcome(7, 'Dana'), outcome(8, 'Eli')] });
    }
    if (path === '/api/pipeline/send-invites') {
      return ok({ emails_queued: 2, portal_link: 'https://resumate.example/candidate/login', outcomes: [
        { interview_id: 70, email: 'dana@x.com', email_id: 1, status: 'queued', error: null },
        { interview_id: 80, email: 'eli@x.com', email_id: 2, status: 'queued', error: null },
      ] });
    }
    // The server's outbox has sent them.
    if (path.startsWith('/api/emails')) {
      return ok({ emails: [1, 2].map(id => ({ id, kind: 'invitation_draft', status: 'sent', error: null })) });
    }
    return ok({});
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Send, and let Jarvis wait for the server's outbox, which sends them a
// moment later: it asks after them 2 seconds on.
async function send(button) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await act(async () => { fireEvent.click(button); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
}

const callsTo = path => calls.filter(c => c.path === path);

async function drafts() {
  render(<JarvisAgent candidatesSummary={PEOPLE} onClose={vi.fn()} onComplete={vi.fn()} />);
  const input = screen.getByLabelText('Message Jarvis');
  fireEvent.change(input, { target: { value: 'invite Dana and Eli' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('button', { name: 'Create the 2 interviews' }));
  return (await screen.findByText(/EMAIL DRAFT · TO: Dana/)).closest('.j-msg');
}

describe("Jarvis's invitation drafts", () => {
  it('list each candidate opened, and send what the manager changed', async () => {
    const card = await drafts();
    fireEvent.click(within(card).getByRole('button', { name: 'Review and edit the drafts' }));
    expect(screen.getByRole('textbox', { name: 'Message for Dana' }).value).toBe('Dear Dana, we would like to talk.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Message for Eli' }), { target: { value: 'Eli, could you talk this week?' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Subject for Eli' }), { target: { value: 'A short interview' } });

    await send(within(document.querySelector('.studio-assistant-detail')).getByRole('button', { name: 'Send 2 Emails →' }));
    expect(screen.getByText(/2 of 2 invitations emailed/)).toBeTruthy();
    expect(callsTo('/api/pipeline/send-invites').map(c => c.body)).toEqual([{
      invites: [
        { interview_id: 70, subject: 'Interview with us', body: 'Dear Dana, we would like to talk.' },
        { interview_id: 80, subject: 'A short interview', body: 'Eli, could you talk this week?' },
      ],
    }]);
  });

  it('show the first draft on the card as it now reads, and say how many Send sends', async () => {
    const card = await drafts();
    expect(within(card).getByRole('button', { name: 'Send 2 Emails →' })).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Review and edit the drafts' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Subject for Dana' }), { target: { value: 'Hello from Dev' } });
    expect(within(card).getByText('Hello from Dev')).toBeTruthy();
  });

  it('can no longer be changed once sent', async () => {
    const card = await drafts();
    await send(within(card).getByRole('button', { name: 'Send 2 Emails →' }));
    expect(screen.getByText(/2 of 2 invitations emailed/)).toBeTruthy();
    expect(within(card).queryByRole('button', { name: /review and edit/i })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Expand' }));
    expect(screen.getByRole('textbox', { name: 'Message for Dana' }).disabled).toBe(true);
  });
});
