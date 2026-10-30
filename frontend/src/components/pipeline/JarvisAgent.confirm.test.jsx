import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';

import JarvisAgent from './JarvisAgent';

/* Jarvis asks before it creates an interview, which gives the candidate the
 * portal: it used to make them the moment the model asked, and to email on
 * "send it". Emails go only from a draft's Send button. */

vi.mock('../../hooks/useVoice', () => ({
  default: () => ({
    isRecording: false, isTranscribing: false, speakingMsgIndex: null,
    speakText: async () => {}, startRecording: () => {}, stopRecording: () => {}, stopSpeaking: () => {},
  }),
}));

const ok = body => ({ ok: true, status: 200, json: async () => body });
const DANA = {
  candidate_id: 7, name: 'Dana', email: 'dana@x.com', interview_created: true, interview_id: 42,
  email_subject: 'Interview with us', email_body: 'Dear Dana, we would like to talk.', email_sent: false,
};
const INVITE_DANA = { reply: 'I can set that up.', action: 'batch_action', action_params: { candidate_ids: [7], role: 'Dev', mode: 'avatar' } };

let calls;
let replies;

beforeEach(() => {
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  calls = [];
  replies = [INVITE_DANA];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const path = String(url).replace(/^.*?\/api\//, '/api/');
    calls.push({ path, body: options.body ? JSON.parse(options.body) : null });
    if (path === '/api/jarvis/chat') return ok(replies.shift() || { reply: 'Okay.', action: null });
    if (path === '/api/pipeline/batch-action') {
      return ok({ total: 1, interviews_created: 1, emails_sent: 0, portal_link: 'https://resumate.example/candidate/login', outcomes: [DANA] });
    }
    return ok({});
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const callsTo = path => calls.filter(c => c.path === path);
const PEOPLE = [{ id: 7, name: 'Dana', email: 'dana@x.com' }];
const open = () => render(<JarvisAgent candidatesSummary={PEOPLE} onClose={vi.fn()} onComplete={vi.fn()} />);

function say(text) {
  const input = screen.getByLabelText('Message Jarvis');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

const theCard = () => screen.findByRole('group', { name: 'Create an interview for Dana?' });

describe('before Jarvis creates an interview', () => {
  it('asks, makes nothing until the manager says yes, then makes it once', async () => {
    open();
    say('invite Dana');
    const card = await theCard();
    expect(within(card).getByText(/can\s+then sign in to the candidate portal/)).toBeTruthy();
    expect(callsTo('/api/pipeline/batch-action')).toHaveLength(0);

    fireEvent.click(within(card).getByRole('button', { name: 'Create the interview' }));
    await screen.findByText(/EMAIL DRAFT · TO: Dana/);
    expect(callsTo('/api/pipeline/batch-action')).toHaveLength(1);
    expect(within(card).queryByRole('button')).toBeNull();
    expect(within(card).getByText('You said yes.')).toBeTruthy();
  });

  it('makes nothing when the manager says not now', async () => {
    open();
    say('invite Dana');
    const card = await theCard();
    fireEvent.click(within(card).getByRole('button', { name: 'Not now' }));
    expect(await screen.findByText('Okay. Nothing was created.')).toBeTruthy();
    expect(within(card).getByText('Not created.')).toBeTruthy();
    expect(callsTo('/api/pipeline/batch-action')).toHaveLength(0);
  });

  it('asked again while a card waits, points to it instead of adding another', async () => {
    replies = [INVITE_DANA, INVITE_DANA];
    open();
    say('invite Dana');
    await theCard();
    say('yes, invite Dana');
    expect(await screen.findByText(/It's waiting for you above: press Create the interview/)).toBeTruthy();
    expect(screen.getAllByRole('group', { name: 'Create an interview for Dana?' })).toHaveLength(1);
  });

  it('asks for the email of one candidate it has none for, with no card', async () => {
    replies = [{ reply: 'Okay.', action: 'create_interview', action_params: { candidate_id: 9, candidate_name: 'Eli', role: 'Dev' } }];
    open();
    say('interview Eli');
    expect(await screen.findByText(/I need the candidate's email before I can create the interview/)).toBeTruthy();
    expect(screen.queryByRole('group', { name: /Create an interview/ })).toBeNull();
    expect(callsTo('/api/chat/create-interview')).toHaveLength(0);
  });

  it('says it will be a voice interview when the server runs no avatar interviews', async () => {
    open();
    say('invite Dana');
    const card = await theCard();
    expect(card.textContent).toMatch(/a voice interview/);
  });
});

describe('an email Jarvis is asked to send at once', () => {
  it('is drafted, not sent, once the interview is made', async () => {
    replies = [{ ...INVITE_DANA, action_params: { ...INVITE_DANA.action_params, send_emails: true } }];
    open();
    say('invite Dana and email her');
    fireEvent.click(within(await theCard()).getByRole('button', { name: 'Create the interview' }));
    await screen.findByText(/EMAIL DRAFT · TO: Dana/);
    await waitFor(() => expect(callsTo('/api/pipeline/batch-action')).toHaveLength(1));
    expect(callsTo('/api/pipeline/batch-action')[0].body.send_emails).toBe(false);
    expect(callsTo('/api/pipeline/send-invites')).toHaveLength(0);
  });
});
