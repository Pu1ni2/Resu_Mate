import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import JarvisAgent from './JarvisAgent';

/* An evaluation is written in the background: asking for one answers with the
 * request, and Jarvis waits for it before it says what it found. */

const spoken = vi.hoisted(() => []);
vi.mock('../../hooks/useVoice', () => ({
  default: () => ({
    isRecording: false, isTranscribing: false, speakingMsgIndex: null,
    speakText: async (text) => { spoken.push(text); },
    startRecording: () => {}, stopRecording: () => {}, stopSpeaking: () => {},
  }),
}));

const ok = body => ({ ok: true, status: 200, json: async () => body });
const PEOPLE = [{ id: 7, name: 'Dana', email: 'dana@x.com' }];
const EVALUATE = { reply: 'Evaluating Dana.', action: 'deep_evaluate', action_params: { candidate_id: 7, candidate_name: 'Dana', role: 'Dev' } };
const ASKED = { request_id: 5, candidate_id: 7, status: 'pending', error: null, role: 'Dev', level: null,
  anonymized: false, evaluation: null };
const WRITTEN = { ...ASKED, status: 'done', evaluation: { evaluation_id: 9, role: 'Dev', report: '## Strengths\n\nShips reliable code.' } };

let calls;
let replies;
let written;  // each answer about the request, the last again once they run out

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  spoken.length = 0;
  calls = [];
  replies = [EVALUATE];
  written = [ASKED, WRITTEN];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const path = String(url).replace(/^.*?\/api\//, '/api/');
    calls.push({ path, body: options.body ? JSON.parse(options.body) : null });
    if (path === '/api/jarvis/chat') return ok(replies.shift() || { reply: 'Okay.', action: null });
    if (path === '/api/chat/hiring-agent') return ok(ASKED);
    if (path === '/api/chat/evaluations/5') return ok(written.length > 1 ? written.shift() : written[0]);
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

async function evaluateDana() {
  const shown = render(<JarvisAgent candidatesSummary={PEOPLE} onClose={vi.fn()} onComplete={vi.fn()} />);
  // Its greeting first, on its own timer.
  await screen.findByText(/Hey, I'm Jarvis/);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await act(async () => { say('evaluate Dana'); });
  return shown;
}

describe("Jarvis's evaluation", () => {
  it('waits while it is written in the background, then says what it found', async () => {
    await evaluateDana();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.queryByText('EVALUATION REPORT')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByText('EVALUATION REPORT')).toBeTruthy();
    // It's what Jarvis then reads, to answer about it.
    expect(callsTo('/api/jarvis/chat').map(c => c.body.message)).toContain('[EVAL_RESULT] ## Strengths\n\nShips reliable code.');
  });

  it("says why, when it couldn't be written", async () => {
    written = [{ ...ASKED, status: 'failed', error: "The evaluation couldn't be completed. Please try again." }];
    await evaluateDana();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByText(/Evaluation failed — The evaluation couldn't be completed\. Please try again\./)).toBeTruthy();
  });

  it('says nothing more once closed while it is written', async () => {
    written = [ASKED];
    const shown = await evaluateDana();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    const said = spoken.length;
    shown.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(800000); });
    expect(spoken.slice(said)).toEqual([]);
    expect(callsTo('/api/chat/evaluations/5')).toHaveLength(1);
  });
});
