import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import { measured } from '../services/scores';
import CandidateDashboard from './CandidateDashboard';
import InterviewReportView from './shared/InterviewReportView';

/* A voice interview has no camera, yet its report said "Face in view: 0%" and
 * "Violations: 0", which reads as a candidate who was never in view. On the
 * free plan every interview is a voice one. A reading that wasn't taken is
 * left out now; a video interview's readings show as before. */

const VOICE = { report: '## Clear answers', avgScore: 8, scores: [{ score: 8, feedback: 'Good' }], timer: 420, mode: 'conversational' };
const VIDEO = { ...VOICE, mode: 'avatar', eyeContact: 90, violations: 1 };

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('measured', () => {
  it('keeps a reading, a real 0 included, and drops a missing one', () => {
    expect(measured(0)).toBe(0);
    expect(measured(72)).toBe(72);
    expect(measured(undefined)).toBeNull();
    expect(measured(null)).toBeNull();
  });
});

describe('the full report', () => {
  it('leaves out the camera readings a voice interview never took', () => {
    render(<InterviewReportView report={VOICE} />);
    expect(screen.getByText('Avg Score')).toBeTruthy();
    expect(screen.queryByText('Face in view')).toBeNull();
    expect(screen.queryByText('Violations')).toBeNull();
  });

  it("shows a video interview's, a clean 0 violations included", () => {
    render(<InterviewReportView report={{ ...VIDEO, violations: 0 }} />);
    expect(screen.getByText('Face in view')).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();
    expect(screen.getByText('Violations')).toBeTruthy();
  });
});

describe("the candidate's report summary", () => {
  async function openReport(report) {
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
    return (await screen.findByText(/Score: 8\/10/)).textContent;
  }

  it('says nothing about a camera after a voice interview', async () => {
    const summary = await openReport(VOICE);
    expect(summary).not.toMatch(/Face in view|Violations/);
    expect(summary).toMatch(/· 7:00/);
  });

  it("gives a video interview's readings", async () => {
    expect(await openReport(VIDEO)).toMatch(/Face in view: 90% · Violations: 1 · 7:00/);
  });
});
