import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import CandidateDashboard from './CandidateDashboard';

/* After an interview the candidate saw whatever the room handed back: a report
 * the avatar room made up, or only a transcript, so "Score: —/10" until they
 * signed in again. Now the dashboard waits for the server's report. */

// The rooms are stand-ins that finish at once with what a room would measure.
vi.mock('./ConversationalInterviewRoom', () => ({
  default: ({ onComplete }) => <button onClick={() => onComplete({ transcript: [] })}>finish voice</button>,
}));
vi.mock('./InterviewRoom', () => ({
  default: ({ onComplete }) => (
    <button onClick={() => onComplete({ violations: 1, eyeContact: 80, timer: 125, terminated: false, lookAwayCount: 2 })}>
      finish avatar
    </button>
  ),
}));

const SESSION = {
  email: 'dana@x.com', name: 'Dana', has_interview: true, interview_completed: false,
  interview_config: { mode: 'conversational', interview_id: 5, role: 'Engineer' },
};
const REPORT = { report: '## Strong answers', avgScore: 7.5, scores: [], timer: 754, violations: 0, eyeContact: 90 };

let reportAnswers;
let saved;

function server() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    if (String(url).endsWith('/api/chat/save-interview-result')) {
      saved.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (String(url).endsWith('/api/chat/candidate/my-report')) {
      const ready = reportAnswers.shift();
      return ready
        ? { ok: true, status: 200, json: async () => ({ interview_completed: true, interview_report: ready }) }
        : { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
}

function renderDashboard(session = SESSION) {
  localStorage.setItem('resumate_candidate', JSON.stringify(session));
  localStorage.setItem('resumate_candidate_token', 'cand-jwt');
  return render(
    <MemoryRouter initialEntries={['/candidate/dashboard']}>
      <AppProvider><CandidateDashboard /></AppProvider>
    </MemoryRouter>,
  );
}

async function sitTheInterview(finish) {
  fireEvent.click(screen.getByText('Interview'));
  fireEvent.click(screen.getByRole('button', { name: /start voice interview|enter interview room/i }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: finish })); });
}

beforeEach(() => {
  localStorage.clear();
  reportAnswers = [];
  saved = [];
  server();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the candidate's report after an interview", () => {
  it("shows the server's report as soon as it is written", async () => {
    reportAnswers = [REPORT];
    renderDashboard();
    await sitTheInterview('finish voice');
    expect(await screen.findByText(/Score: 7.5\/10/)).toBeTruthy();
    expect(screen.getByText(/12:34/)).toBeTruthy();
  });

  it('says it is preparing, and keeps asking until the report is ready', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    reportAnswers = [null, null, REPORT];
    renderDashboard();
    await sitTheInterview('finish voice');
    expect(screen.getByText('Preparing your report…')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(screen.getByText(/Score: 7.5\/10/)).toBeTruthy();
  });

  it('offers Refresh when the report still is not ready', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    renderDashboard();
    await sitTheInterview('finish voice');
    await act(async () => { await vi.advanceTimersByTimeAsync(20 * 4000); });
    expect(screen.getByText(/still being prepared/i)).toBeTruthy();
    reportAnswers = [REPORT];
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); });
    expect(screen.getByText(/Score: 7.5\/10/)).toBeTruthy();
  });

  it('saves what the avatar room measured, not a report of its own', async () => {
    reportAnswers = [REPORT];
    renderDashboard({ ...SESSION, interview_config: { ...SESSION.interview_config, mode: 'avatar' } });
    await sitTheInterview('finish avatar');
    await screen.findByText(/Score: 7.5\/10/);
    expect(saved[0].report).toEqual({ violations: 1, eyeContact: 80, timer: 125, terminated: false, lookAwayCount: 2 });
  });

  it('fetches the report when signing in after a finished interview', async () => {
    reportAnswers = [REPORT];
    renderDashboard({ ...SESSION, has_interview: false, interview_completed: true });
    fireEvent.click(await screen.findByText('Interview Report'));
    expect(await screen.findByText(/Score: 7.5\/10/)).toBeTruthy();
  });
});
