import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ATSResultsView from './ATSResultsView';

/* What the screening results say about themselves: a run given only a role
 * compares roles, not skills, and files it couldn't screen are counted. */

const RESULT = {
  candidate_id: 1, name: 'Ada', email: 'ada@x.com', ats_score: 90, verdict: 'Strong Fit',
  role_match: 90, skills_match: null, experience_match: null, education_match: null,
  matched_skills: [], missing_skills: [], assessed: ['role'],
};

const run = extra => ({
  role: 'Backend Engineer', total_screened: 1, elapsed_ms: 12,
  stats: { strong_fit: 1, good_fit: 0, consider: 0, no_match: 0 },
  results: [RESULT], shortlist: [RESULT], jd_requirements: { required_skills: [] },
  ...extra,
});

const open = pipelineResult => render(
  <MemoryRouter>
    <ATSResultsView pipelineResult={pipelineResult} onBack={vi.fn()} onRunAgain={vi.fn()} />
  </MemoryRouter>,
);

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ statuses: {} }) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the screening results', () => {
  it('say when they compare roles only', () => {
    open(run({ assessed: ['role'], excluded: 0 }));
    expect(screen.getByText(/Ranked by role only/)).toBeTruthy();
  });

  it('say nothing of the kind when skills were asked for', () => {
    open(run({ assessed: ['skills', 'role'], excluded: 0 }));
    expect(screen.queryByText(/Ranked by role only/)).toBeNull();
  });

  it('count the files they left out', () => {
    open(run({ assessed: ['role'], excluded: 2 }));
    expect(screen.getByText(/2 files were left out: not a résumé, or its analysis failed\./)).toBeTruthy();
  });

  it('from an older run, without those fields, say neither', () => {
    open(run({}));
    expect(screen.queryByText(/Ranked by role only/)).toBeNull();
    expect(screen.queryByText(/left out/)).toBeNull();
  });
});
