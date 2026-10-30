import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import JarvisAgent from './JarvisAgent';

/* Jarvis in the Studio design: on paper, with the brand's mark in its
 * wordmark; and the cards of its two analyses of a person, where the design
 * and the scores' removal met, still showing no score on them, even when the
 * server sends one. */

vi.mock('../../hooks/useVoice', () => ({
  default: () => ({
    isRecording: false, isTranscribing: false, speakingMsgIndex: null,
    speakText: async () => {}, startRecording: () => {}, stopRecording: () => {}, stopSpeaking: () => {},
  }),
}));

const ok = body => ({ ok: true, status: 200, json: async () => body });
const INTEL = {
  gaps: [{ type: 'employment_gap', detail: 'A year between two roles', severity: 'low' }],
  red_flags: [], verification_targets: [], strong_points: [], resume_confidence_score: 61,
};
const COMPARISON = {
  credibility_score: 34, hiring_recommendation: 'No Hire', credibility_verdict: 'Low Credibility',
  key_insights: ['Talked through a Python service in detail.'],
  resume_vs_interview: { confirmed_skills: ['Python'], overrated_skills: [], hidden_strengths: [], unverified_skills: [] },
};

let replies;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  replies = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    const path = String(url).replace(/^.*?\/api\//, '/api/');
    if (path === '/api/jarvis/chat') return ok(replies.shift() || { reply: 'Okay.', action: null });
    if (path === '/api/chat/resume-intelligence') return ok({ intelligence: INTEL });
    if (path === '/api/chat/credibility-analysis') return ok({ credibility: COMPARISON });
    return ok({});
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const open = () => render(<JarvisAgent candidatesSummary={[]} onClose={vi.fn()} onComplete={vi.fn()} />);

function say(text) {
  const input = screen.getByLabelText('Message Jarvis');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

// What the card says, then what its expanded detail says.
async function cardAndDetail(heading) {
  const card = (await screen.findByText(heading)).closest('.j-msg');
  const words = card.textContent;
  fireEvent.click(within(card).getByRole('button', { name: 'Expand' }));
  const detail = document.querySelector('.studio-assistant-detail');
  return [words, detail.textContent];
}

describe('Jarvis in the Studio design', () => {
  it("is on paper, with the brand's mark in its wordmark", () => {
    const { container } = open();
    expect(container.querySelector('.studio-assistant')).toBeTruthy();
    const mark = container.querySelector('.sa-wordmark .sa-mark');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.textContent).toBe('');
    expect(container.querySelector('.sa-wordmark').textContent).toBe('ResuMateYOUR HIRING ASSISTANT');
    expect(container.querySelector('.sa-heading').textContent).toBe('A little perspective.');
  });
});

describe("its analyses of a person show no score on them, in the card or opened", () => {
  it('the résumé analysis', async () => {
    replies = [{ reply: 'Looking at it.', action: 'resume_intelligence', action_params: { candidate_id: 7, candidate_name: 'Dana' } }];
    open();
    say('What should I ask Dana?');
    const [card, detail] = await cardAndDetail(/RESUME INTELLIGENCE · Dana/);
    expect(card).toMatch(/GAPS1/);
    expect(detail).toMatch(/A year between two roles/);
    for (const text of [card, detail]) {
      expect(text).not.toMatch(/61|confidence/i);
    }
  });

  it('the résumé and interview comparison', async () => {
    replies = [{
      reply: 'Comparing them.', action: 'credibility_analysis',
      action_params: { candidate_id: 7, candidate_name: 'Dana', candidate_email: 'dana@x.com' },
    }];
    open();
    say('Did Dana live up to the résumé?');
    const [card, detail] = await cardAndDetail('RÉSUMÉ AND INTERVIEW');
    expect(card).toMatch(/Talked through a Python service in detail\./);
    expect(detail).toMatch(/SHOWN IN THE INTERVIEW/);
    for (const text of [card, detail]) {
      expect(text).not.toMatch(/34|No Hire|Low Credibility|credibility|recommendation/i);
    }
  });
});
