import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import CandidateDashboard from './CandidateDashboard';

/* The portal's line under "Interview Completed" said "Score: —/10" when no
 * answer had been scored: a score out of ten that wasn't one. */

const UNSCORED = { report: '## Your interview', avgScore: null, scores: [{ score: null, feedback: '' }], timer: 420, mode: 'conversational' };

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

async function summaryOf(report) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
    String(url).endsWith('/api/chat/candidate/my-report')
      ? { ok: true, status: 200, json: async () => ({ interview_completed: true, interview_report: report }) }
      : { ok: true, status: 200, json: async () => ({}) }
  ));
  localStorage.setItem('resumate_candidate', JSON.stringify({
    email: 'dana@x.com', name: 'Dana', has_interview: false, interview_completed: true,
  }));
  localStorage.setItem('resumate_candidate_token', 'cand-jwt');
  render(
    <MemoryRouter initialEntries={['/candidate/dashboard']}>
      <AppProvider><CandidateDashboard /></AppProvider>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByText('Interview Report'));
  return (await screen.findByRole('heading', { name: 'Interview Completed' })).nextElementSibling.textContent;
}

describe("the portal's interview summary", () => {
  it('gives no score when no answer was scored, only the time taken', async () => {
    expect(await summaryOf(UNSCORED)).toBe('7:00');
  });

  it("gives the scored answers' average when the report has none of its own", async () => {
    const report = { ...UNSCORED, scores: [{ score: 7 }, { score: null }, { score: 8 }] };
    expect(await summaryOf(report)).toBe('Score: 7.5/10 · 7:00');
  });

  it("gives the report's own score, and a video interview's readings after it", async () => {
    const report = { ...UNSCORED, avgScore: 8, mode: 'avatar', eyeContact: 90, violations: 0 };
    expect(await summaryOf(report)).toBe('Score: 8/10 · Face in view: 90% · Violations: 0 · 7:00');
  });
});
