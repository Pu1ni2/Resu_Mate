import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';

import JarvisAgent from './JarvisAgent';

/* An interview report, fetched by Jarvis. Interviews aren't scored per
 * answer any more, and Jarvis's card said "AVG —", the report opened said
 * "Avg Score —" and "Questions 0", and Jarvis was told the candidate "scored
 * N/A on average". */

vi.mock('../../hooks/useVoice', () => ({
  default: () => ({
    isRecording: false, isTranscribing: false, speakingMsgIndex: null,
    speakText: async () => {}, startRecording: () => {}, stopRecording: () => {}, stopSpeaking: () => {},
  }),
}));

const ok = body => ({ ok: true, status: 200, json: async () => body });
const UNSCORED = { scores: [], avgScore: null, mode: 'conversational', report: '## Interview Summary\n\nClear and kind.', transcript: [] };
const SCORED = { ...UNSCORED, scores: [{ question: 'A hard bug?', score: 8 }, { question: 'A trade-off?', score: 6 }] };

let report;
let sent;

beforeEach(() => {
  // Jarvis keeps its conversation, and what it has fetched, for the session.
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  sent = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const path = String(url).replace(/^.*?\/api\//, '/api/');
    if (path === '/api/jarvis/chat') {
      sent.push(JSON.parse(options.body).message);
      return ok(sent.length === 1
        ? { reply: 'Fetching it.', action: 'get_interview_report', action_params: { candidate_id: 7, candidate_name: 'Dana', candidate_email: 'dana@x.com' } }
        : { reply: 'Here it is.', action: null });
    }
    if (path.startsWith('/api/chat/get-interview-results/')) return ok({ results: [{ report }] });
    return ok({});
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function fetchReport() {
  render(<JarvisAgent candidatesSummary={[]} onClose={vi.fn()} onComplete={vi.fn()} />);
  const input = screen.getByLabelText('Message Jarvis');
  fireEvent.change(input, { target: { value: "How did Dana's interview go?" } });
  fireEvent.keyDown(input, { key: 'Enter' });
  const card = (await screen.findByText('INTERVIEW REPORT')).closest('.j-msg');
  // Jarvis's answer to the report: what it was told is sent by then.
  await screen.findAllByText('Here it is.');
  fireEvent.click(within(card).getByRole('button', { name: 'Expand' }));
  return { card: card.textContent, detail: document.querySelector('.studio-assistant-detail').textContent, told: sent[1] };
}

describe("an interview report in Jarvis", () => {
  it('shows no empty average or count of questions, and Jarvis hears that the answers were not scored', async () => {
    report = UNSCORED;
    const { card, detail, told } = await fetchReport();
    expect(card).not.toMatch(/AVG/);
    expect(detail).not.toMatch(/AVG SCORE|QUESTIONS/);
    expect(detail).toMatch(/Clear and kind\./);
    expect(told).toMatch(/Dana's interview report is ready; its answers were not scored\./);
    expect(told).not.toMatch(/N\/A/);
  });

  it('still shows the average of an interview that has one', async () => {
    report = SCORED;
    const { card, detail, told } = await fetchReport();
    expect(card).toMatch(/AVG7/);
    expect(detail).toMatch(/AVG SCORE7/);
    expect(detail).toMatch(/QUESTIONS2/);
    expect(told).toMatch(/with an average answer score of 7\./);
  });
});
