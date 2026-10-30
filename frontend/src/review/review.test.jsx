import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { Review } from './review';
import { pipeline, report, results } from './fixtures';
import api from '../services/api';

/* The design review page opens every page it lists as the real page, and its
 * sample data is shaped like the backend's, so a design is judged with what a
 * user really sees. */

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('resumate_onboarded', 'true');
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true, status: 200, json: async () => ({ statuses: {}, results: [], access: false }),
  });
  vi.spyOn(api, 'get').mockResolvedValue({ data: { runs: [] } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the design review page', () => {
  it('opens every page it lists, as the real page', async () => {
    const { container } = render(<Review />);
    const picker = screen.getByRole('combobox', { name: 'Review a page' });
    const paths = Array.from(picker.options).map(option => option.value);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      fireEvent.change(picker, { target: { value: path } });
      expect(picker.value).toBe(path);
      await waitFor(() => expect(container.querySelector('h1, h2'), path).toBeTruthy());
      // The page for addresses it doesn't have.
      expect(screen.queryByText('Back to the studio.')).toBeNull();
    }
  });
});

describe('its sample data', () => {
  it('has interviews reported as they really are: in four sections, with no per-answer scores', () => {
    expect(report.scores).toEqual([]);
    expect(report.avgScore).toBeNull();
    expect(report.report.match(/^## .+$/gm)).toEqual([
      '## Interview Summary', '## Strengths', '## Concerns', '## Recommendation',
    ]);
    expect(report.transcript.map(turn => turn.role)).toEqual(['interviewer', 'candidate', 'interviewer', 'candidate']);
    expect(results.every(result => result.report === report && result.scores.length === 0)).toBe(true);
  });

  it('has a screening run with what the backend sends, ranked and judged as it is', () => {
    const run = pipeline([101, 102, 103]);
    expect(Object.keys(run).sort()).toEqual([
      'assessed', 'elapsed_ms', 'excluded', 'jd_requirements', 'results', 'role', 'shortlist', 'stats',
      'total_screened',
    ]);
    expect(run.total_screened).toBe(3);
    const scores = run.results.map(r => r.ats_score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    // The backend's verdict thresholds.
    for (const { ats_score: score, verdict } of run.results) {
      const expected = score >= 75 ? 'Strong Fit' : score >= 55 ? 'Good Fit' : score >= 35 ? 'Consider' : 'No Match';
      expect(verdict).toBe(expected);
    }
    // Every required skill is either matched or missing, for each person.
    for (const r of run.results) {
      expect([...r.matched_skills, ...r.missing_skills].sort()).toEqual([...run.jd_requirements.required_skills].sort());
    }
    const { strong_fit: strong, good_fit: good, consider, no_match: none } = run.stats;
    expect(strong + good + consider + none).toBe(run.total_screened);
  });
});
