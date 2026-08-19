import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RankedCandidates, { RankedSummary } from './RankedCandidates';
import ScoreRing from './ScoreRing';
import { fromAtsResult, fromRankingRow, verdictForScore, normalizeVerdict } from './adapters';

const atsPayload = {
  candidate_id: 7,
  name: 'Maya Rodriguez',
  email: 'maya@x.com',
  ats_score: 92,
  verdict: 'Strong Fit',
  predicted_role: 'ML Engineer',
  total_experience_years: 6,
  location: 'Berlin',
  skills_match: 94,
  experience_match: 88,
  role_match: 90,
  education_match: 100,
  matched_skills: ['Python', 'FastAPI'],
  missing_skills: ['Kubernetes'],
  summary: 'Ships production ML.',
};

describe('adapters', () => {
  it('mirrors the backend verdict thresholds', () => {
    // Must track ats_service.py: >=75 / >=55 / >=35 / else.
    expect(verdictForScore(75)).toBe('Strong Fit');
    expect(verdictForScore(74)).toBe('Good Fit');
    expect(verdictForScore(55)).toBe('Good Fit');
    expect(verdictForScore(54)).toBe('Consider');
    expect(verdictForScore(35)).toBe('Consider');
    expect(verdictForScore(34)).toBe('No Match');
  });

  it('normalises the LLM ranker\'s fuzzy verdict strings', () => {
    // The LLM returns prose like "Strong candidate", not the four exact labels.
    expect(normalizeVerdict('Strong candidate', 90)).toBe('Strong Fit');
    expect(normalizeVerdict('Potential fit', 60)).toBe('Consider');
    expect(normalizeVerdict('Poor match', 20)).toBe('No Match');
    // Unrecognised text falls back to the score, never to an invented label.
    expect(normalizeVerdict('banana', 80)).toBe('Strong Fit');
  });

  it('maps an ATS result onto the shared row shape', () => {
    const row = fromAtsResult(atsPayload);
    expect(row.id).toBe(7);
    expect(row.score).toBe(92);
    expect(row.meta).toBe('ML Engineer · 6y exp · Berlin');
    expect(row.bars).toHaveLength(4);
  });

  it('maps an LLM ranking onto the same shape', () => {
    const row = fromRankingRow({
      name: 'Dev Patel', score: 81, verdict: 'Strong candidate',
      standout: 'Deep Django background', strengths: ['Django'], gaps: ['AWS'],
      interview_priority: 'High',
    });
    expect(row.score).toBe(81);
    expect(row.verdict).toBe('Strong Fit');
    expect(row.matched).toEqual(['Django']);
  });

  it('survives a malformed payload rather than rendering NaN', () => {
    const row = fromAtsResult({});
    expect(row.score).toBe(0);
    expect(row.name).toBe('Unknown');
    expect(row.verdict).toBe('No Match');
  });
});

describe('ScoreRing', () => {
  it('clamps out-of-range scores so the arc cannot wrap', () => {
    const { container, rerender } = render(<ScoreRing score={140} />);
    expect(container.firstChild.textContent).toBe('100');
    rerender(<ScoreRing score={-5} />);
    expect(container.firstChild.textContent).toBe('0');
    rerender(<ScoreRing score={undefined} />);
    expect(container.firstChild.textContent).toBe('0');
  });

  it('exposes the score to assistive tech', () => {
    render(<ScoreRing score={64} />);
    expect(screen.getByRole('img', { name: /64 out of 100/ })).toBeTruthy();
  });
});

describe('RankedCandidates', () => {
  const rows = [fromAtsResult(atsPayload)];

  it('renders a row per candidate', () => {
    render(<RankedCandidates rows={rows} />);
    expect(screen.getByText('Maya Rodriguez')).toBeTruthy();
    expect(screen.getByText('Strong Fit')).toBeTruthy();
  });

  it('shows an empty message rather than a bare box', () => {
    render(<RankedCandidates rows={[]} emptyMessage="Nothing here." />);
    expect(screen.getByText('Nothing here.')).toBeTruthy();
  });

  it('hides detail until expanded', () => {
    render(<RankedCandidates rows={rows} />);
    expect(screen.queryByText('Ships production ML.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show details/ }));
    expect(screen.getByText('Ships production ML.')).toBeTruthy();
  });

  it('reports selection by candidate id', () => {
    const onToggle = vi.fn();
    render(<RankedCandidates rows={rows} selectable selectedIds={[]} onToggleSelect={onToggle} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Maya/ }));
    expect(onToggle).toHaveBeenCalledWith(7);
  });

  it('scales match bars to their value, never full width', () => {
    const { container } = render(<RankedCandidates rows={rows} />);
    const widths = [...container.querySelectorAll('[style*="width"]')].map(e => e.style.width);
    expect(widths).toContain('94%');
    expect(widths).not.toContain('100%');
  });

  it('compact variant drops the ring and detail', () => {
    render(<RankedCandidates rows={rows} variant="compact" />);
    expect(screen.getByText('Maya Rodriguez')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /out of 100/ })).toBeNull();
  });
});

describe('RankedSummary', () => {
  it('omits the timing claim when the API did not measure it', () => {
    const { container } = render(<RankedSummary screened={12} strongFits={4} />);
    expect(container.textContent).toContain('12');
    expect(container.textContent).not.toMatch(/Ranked in/);
  });

  it('shows timing when provided', () => {
    const { container } = render(<RankedSummary screened={12} strongFits={4} elapsedMs={8200} />);
    expect(container.textContent).toMatch(/Ranked in 8\.2s/);
  });
});
