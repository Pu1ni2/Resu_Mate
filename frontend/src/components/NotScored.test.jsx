import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { averageScore, scoreOf, shownScore } from '../services/scores';
import InterviewReportView from './shared/InterviewReportView';
import ResumeIntelPanel from './focus/ResumeIntelPanel';

/* When the AI step failed the server used to make numbers up (70, 50, 5), and
 * the pages turned anything missing into 0. A missing score now comes as null
 * and shows as "—" or "Not scored". */

afterEach(() => {
  vi.restoreAllMocks();
});

function answers(body) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => body });
}

describe('the score helpers', () => {
  it('average only the scored answers', () => {
    expect(averageScore([{ score: 8 }, { score: null }, 6])).toBe(7);
    expect(averageScore([{ score: null }])).toBeNull();
    expect(averageScore(undefined)).toBeNull();
    expect(scoreOf({ score: '7' })).toBeNull();
  });

  it('show the dash for a missing score, and a real 0 as 0', () => {
    expect(shownScore(null)).toBe('—');
    expect(shownScore(0)).toBe(0);
  });
});

describe('the interview report', () => {
  const report = { scores: [{ score: 8, feedback: 'Clear' }, { score: null, feedback: "This answer couldn't be scored." }], report: '' };

  it('averages the scored answers and shows the unscored one as a dash', () => {
    render(<InterviewReportView report={report} />);
    expect(screen.getByText('8.0')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('0/10')).toBeNull();
  });

  it('says "Not scored" for a credibility analysis that could not be completed', async () => {
    answers({ credibility: { credibility_score: null, analysis_failed: true, key_insights: ['The credibility analysis could not be completed. Try again.'] } });
    render(<InterviewReportView report={report} viewer="manager" candidateId={1} candidateEmail="ada@x.com" />);
    fireEvent.click(screen.getByRole('button', { name: /run credibility analysis/i }));
    expect(await screen.findByText('Not scored')).toBeTruthy();
    expect(screen.queryByText(/\/100/)).toBeNull();
    expect(screen.getByText(/confidence: —/i)).toBeTruthy();
  });
});

describe('the résumé analysis', () => {
  it('says it could not be completed, and offers it again', async () => {
    const spy = answers({ intelligence: { resume_confidence_score: null, analysis_failed: true, gaps: [] } });
    render(<ResumeIntelPanel focusCandidate={{ id: 3, name: 'Ada' }} />);
    fireEvent.click(screen.getByRole('button', { name: /analyze resume/i }));
    expect(await screen.findByText(/couldn't be completed, so there is no confidence score/i)).toBeTruthy();
    expect(screen.queryByText('70')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
