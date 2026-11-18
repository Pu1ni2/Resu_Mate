import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import JarvisAgent from './JarvisAgent';

/* Jarvis's batch waited on one request for every interview, its questions and
 * its email: minutes, and a browser that gave up meanwhile lost them all. The
 * server makes them in the background now (POST /api/pipeline/batches), and
 * Jarvis waits for them, asking after the batch. */

// What Jarvis says aloud; it hears nothing.
const spoken = vi.hoisted(() => []);
vi.mock('../../hooks/useVoice', () => ({
  default: () => ({
    isRecording: false, isTranscribing: false, speakingMsgIndex: null,
    speakText: async (text) => { spoken.push(text); },
    startRecording: () => {}, stopRecording: () => {}, stopSpeaking: () => {},
  }),
}));

const LINK = 'https://resumate.example/candidate/login';
const DANA = {
  candidate_id: 7, name: 'Dana', email: 'dana@x.com', status: 'done', interview_created: true, interview_id: 42,
  email_subject: 'Interview with us', email_body: 'Dear Dana, we would like to talk.', email_sent: false,
};
const DANA_QUEUED = { candidate_id: 7, name: 'Dana', email: 'dana@x.com', status: 'queued', interview_created: false, email_sent: false };
const INVITE_DANA = { reply: 'Setting that up.', action: 'batch_action', action_params: { candidate_ids: [7], role: 'Dev' } };
const batch = (finished, outcomes) => ({
  batch_id: 3, finished, total: outcomes.length, portal_link: LINK, outcomes, emails_sent: 0,
  interviews_created: outcomes.filter(o => o.interview_created).length,
});

const ok = body => ({ ok: true, status: 200, json: async () => body });

let calls;
let started;   // what POST /api/pipeline/batches answers
let progress;  // what each GET of the batch answers, in turn; the last again after

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  calls = [];
  const replies = [INVITE_DANA];
  started = batch(true, [DANA]);
  progress = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const path = String(url).replace(/^.*?\/api\//, '/api/');
    calls.push({ path, body: options.body ? JSON.parse(options.body) : null });
    if (path === '/api/jarvis/chat') return ok(replies.shift() || { reply: 'Okay.', action: null });
    if (path === '/api/pipeline/batches') return ok(started);
    if (path === '/api/pipeline/batches/3') {
      const asked = calls.filter(c => c.path === path).length;
      return ok(progress[Math.min(asked, progress.length) - 1]);
    }
    return ok({});
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const callsTo = path => calls.filter(c => c.path === path);

function say(text) {
  const input = screen.getByLabelText('Message Jarvis');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

// Jarvis asks before it creates an interview; the manager says yes.
async function inviteDana() {
  const shown = render(<JarvisAgent candidatesSummary={[]} onClose={vi.fn()} onComplete={vi.fn()} />);
  say('invite Dana');
  const yes = await screen.findByRole('button', { name: 'Create the interview' });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await act(async () => { fireEvent.click(yes); });
  return shown;
}

describe("Jarvis's batch", () => {
  it('starts with a key of its own, saying it comes from Jarvis', async () => {
    await inviteDana();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const [{ body }] = callsTo('/api/pipeline/batches');
    expect(body.client_key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(body.source).toBe('jarvis');
    expect(body.candidate_ids).toEqual([7]);
  });

  it('waits while the server prepares the interviews, then shows the draft', async () => {
    started = batch(false, [DANA_QUEUED]);
    progress = [batch(false, [{ ...DANA_QUEUED, status: 'questions', interview_created: true }]), batch(true, [DANA])];
    await inviteDana();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText('PREPARING 0/1')).toBeTruthy();
    expect(screen.queryByText(/EMAIL DRAFT · TO: Dana/)).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText(/EMAIL DRAFT · TO: Dana/)).toBeTruthy();
    expect(callsTo('/api/pipeline/batches/3')).toHaveLength(2);
  });

  it('asks no more once Jarvis closes, and says nothing more', async () => {
    started = batch(false, [DANA_QUEUED]);
    progress = [batch(false, [DANA_QUEUED])];
    const shown = await inviteDana();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(callsTo('/api/pipeline/batches/3')).toHaveLength(1);
    const said = spoken.length;
    shown.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(callsTo('/api/pipeline/batches/3')).toHaveLength(1);
    expect(spoken.slice(said)).toEqual([]);
  });

  it('says the interviews are still being prepared when it has waited long enough', async () => {
    started = batch(false, [DANA_QUEUED]);
    progress = [batch(false, [DANA_QUEUED])];
    await inviteDana();
    await act(async () => { await vi.advanceTimersByTimeAsync(41 * 60 * 1000); });
    expect(screen.getByText(/still being prepared/)).toBeTruthy();
    expect(screen.queryByText(/EMAIL DRAFT/)).toBeNull();
  });

  it('says why each one who could not be invited was not', async () => {
    started = batch(true, [
      DANA,
      { candidate_id: 9, name: '', email: '', status: 'skipped', interview_created: false, email_sent: false,
        skipped: 'They’re no longer among your candidates.' },
      { candidate_id: 10, name: 'Sam', email: 'sam@x.com', status: 'skipped', interview_created: false, email_sent: false,
        skipped: 'The sample résumé is for trying ResuMate, so it can’t be invited to an interview.' },
    ]);
    await inviteDana();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(/One candidate couldn't be invited\. They’re no longer among your candidates\./)).toBeTruthy();
    expect(screen.getByText(/Sam couldn't be invited\. The sample résumé is for trying ResuMate/)).toBeTruthy();
    expect(screen.queryByText(/Sam couldn't be invited: there's no email address/)).toBeNull();
  });
});
