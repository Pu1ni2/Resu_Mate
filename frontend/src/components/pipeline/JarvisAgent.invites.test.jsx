import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

import JarvisAgent from './JarvisAgent';

/* Jarvis's Send button on an invitation draft, and "send it" said after one,
 * ran the batch again: every interview was made a second time, and what went
 * out was a fixed template rather than the draft on screen. */

// Jarvis talks through the voice hook; here it says nothing and hears nothing.
vi.mock('../../hooks/useVoice', () => ({
  default: () => ({
    isRecording: false, isTranscribing: false, speakingMsgIndex: null,
    speakText: async () => {}, startRecording: () => {}, stopRecording: () => {}, stopSpeaking: () => {},
  }),
}));

const LINK = 'https://resumate.example/candidate/login';
const DANA = {
  candidate_id: 7, name: 'Dana', email: 'dana@x.com', interview_created: true, interview_id: 42,
  email_subject: 'Interview with us', email_body: 'Dear Dana, we would like to talk.', email_sent: false,
};
const ELI_SKIPPED = {
  candidate_id: 8, name: 'Eli', email: '', interview_created: false, email_sent: false,
  skipped: "No email address on this résumé, so they can't be invited.",
};
const INVITE_DANA = { reply: 'Setting that up.', action: 'batch_action', action_params: { candidate_ids: [7], role: 'Dev' } };

const ok = body => ({ ok: true, status: 200, json: async () => body });

let calls;
let replies;
let batchAnswer;
let sendAnswer;

function server() {
  calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const path = String(url).replace(/^.*?\/api\//, '/api/');
    calls.push({ path, body: options.body ? JSON.parse(options.body) : null });
    if (path === '/api/jarvis/chat') return ok(replies.shift() || { reply: 'Okay.', action: null });
    if (path === '/api/pipeline/batch-action') return ok(batchAnswer);
    if (path === '/api/pipeline/send-invites') return sendAnswer;
    if (path === '/api/chat/create-interview') {
      return ok({ message: 'Interview created', interview_config: { role: 'Dev', mode: 'conversational' }, invite_sent: false, portal_link: LINK });
    }
    return ok({});
  });
}

const callsTo = path => calls.filter(c => c.path === path);

function say(text) {
  const input = screen.getByLabelText('Message Jarvis');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

async function draftForDana() {
  render(<JarvisAgent candidatesSummary={[]} onClose={vi.fn()} onComplete={vi.fn()} />);
  say('invite Dana');
  await screen.findByText(/EMAIL DRAFT · TO: Dana/);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // Jarvis scrolls to each new message; jsdom has no scrolling.
  Element.prototype.scrollIntoView = vi.fn();
  replies = [INVITE_DANA];
  batchAnswer = { total: 1, interviews_created: 1, emails_sent: 0, portal_link: LINK, outcomes: [DANA] };
  sendAnswer = ok({ emails_sent: 1, portal_link: LINK, outcomes: [{ interview_id: 42, email: 'dana@x.com', email_sent: true }] });
  server();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("sending Jarvis's invitation draft", () => {
  it('emails the draft shown, for the interview already made', async () => {
    await draftForDana();
    fireEvent.click(screen.getByRole('button', { name: /send email/i }));
    await screen.findByText(/1 of 1 invitation emailed/);
    expect(callsTo('/api/pipeline/send-invites').map(c => c.body)).toEqual([
      { invites: [{ interview_id: 42, subject: 'Interview with us', body: 'Dear Dana, we would like to talk.' }] },
    ]);
    expect(callsTo('/api/pipeline/batch-action')).toHaveLength(1);
  });

  it('sends it once', async () => {
    await draftForDana();
    fireEvent.click(screen.getByRole('button', { name: /send email/i }));
    const button = await screen.findByRole('button', { name: /sent/i });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(callsTo('/api/pipeline/send-invites')).toHaveLength(1);
  });

  it('"send it" sends the draft rather than making the interviews again', async () => {
    replies = [INVITE_DANA, { reply: 'Sending now.', action: 'batch_action', action_params: { candidate_ids: [7], role: 'Dev', send_emails: true } }];
    await draftForDana();
    say('send it');
    await screen.findByText(/1 of 1 invitation emailed/);
    expect(callsTo('/api/pipeline/batch-action')).toHaveLength(1);
    expect(callsTo('/api/pipeline/send-invites')).toHaveLength(1);
  });

  it('gives the sign-in link when email is not set up', async () => {
    const why = "Email isn't set up on this server. Share the portal link instead.";
    sendAnswer = { ok: false, status: 503, json: async () => ({ detail: why }) };
    await draftForDana();
    fireEvent.click(screen.getByRole('button', { name: /send email/i }));
    await screen.findByText(new RegExp(`Candidate sign-in link: ${window.location.origin}/candidate/login`));
    expect(screen.getByText(new RegExp(`couldn't send the invitations — ${why}`))).toBeTruthy();
    // Not marked sent, so it can be tried again.
    expect(screen.getByRole('button', { name: /send email/i }).disabled).toBe(false);
  });
});

describe('what Jarvis says after a batch', () => {
  it('names who could not be invited', async () => {
    batchAnswer = { ...batchAnswer, total: 2, outcomes: [DANA, ELI_SKIPPED] };
    await draftForDana();
    expect(screen.getByText(/Eli couldn't be invited: there's no email address on the résumé/)).toBeTruthy();
  });

  it('says so when no interview was made', async () => {
    batchAnswer = { total: 1, interviews_created: 0, emails_sent: 0, portal_link: LINK, outcomes: [ELI_SKIPPED] };
    render(<JarvisAgent candidatesSummary={[]} onClose={vi.fn()} onComplete={vi.fn()} />);
    say('invite Eli');
    expect(await screen.findByText(/I couldn't create any interviews/)).toBeTruthy();
    expect(screen.queryByText(/EMAIL DRAFT/)).toBeNull();
  });
});

describe('a single interview from Jarvis', () => {
  it('shows the sign-in link to send', async () => {
    replies = [{
      reply: 'Creating it.', action: 'create_interview',
      action_params: { candidate_id: 7, candidate_name: 'Dana', candidate_email: 'dana@x.com', role: 'Dev' },
    }];
    render(<JarvisAgent candidatesSummary={[]} onClose={vi.fn()} onComplete={vi.fn()} />);
    say('interview Dana');
    await screen.findByText('INTERVIEW CREATED');
    await waitFor(() => expect(screen.getByText(LINK)).toBeTruthy());
    expect(screen.getByText(/not emailed\. send them this sign-in link/i)).toBeTruthy();
  });
});
