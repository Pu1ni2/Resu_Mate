import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import InterviewReportView from './InterviewReportView';

/* The report a hiring manager reads after every interview, and the one a
 * candidate sees of themselves. It had no test.
 *
 * Three things these pin down:
 *   - The score bands. Green/amber/red were literals scattered across four
 *     places; they are one function now and the boundaries are 80 and 60.
 *   - The manager-only sections. The résumé-and-interview comparison checks someone's resume
 *     claims against their interview answers to detect exaggeration, and its
 *     endpoint is manager-scoped, so showing it to the candidate being assessed
 *     was a product mistake as much as an auth one. Same for the PDF export,
 *     whose endpoint a candidate token can never satisfy.
 *   - Two colours were light-theme literals on a dark product: a near-white
 *     termination banner and a slate-200 score-bar track.
 */

const report = {
  scores: [{ score: 9, feedback: 'Strong' }, { score: 5 }, { score: 2 }],
  eyeContact: 82,
  violations: 0,
  timer: 754,
  report: '## Evaluation\n\nSolid across the board.',
  transcript: [
    { role: 'interviewer', text: 'Tell me about a hard bug.' },
    { role: 'candidate', text: 'A race in our cache layer.' },
  ],
};

const renderReport = (props = {}) =>
  render(<InterviewReportView report={report} {...props} />);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('what the report shows', () => {
  it('summarises the interview', () => {
    renderReport();
    expect(screen.getByText(/interview completed/i)).toBeTruthy();
    // 754s -> 12:34, and three questions answered.
    expect(screen.getByText(/3 questions answered/i)).toBeTruthy();
    // Twice on purpose: once in the header line, once in the Duration tile.
    expect(screen.getAllByText(/12:34/)).toHaveLength(2);
  });

  it('scores every question', () => {
    renderReport();
    expect(screen.getByText('9/10')).toBeTruthy();
    expect(screen.getByText('5/10')).toBeTruthy();
    expect(screen.getByText('2/10')).toBeTruthy();
  });

  it('renders the evaluation markdown', () => {
    renderReport();
    expect(screen.getByText(/solid across the board/i)).toBeTruthy();
  });

  it('says so plainly when there is no report', () => {
    render(<InterviewReportView report={null} />);
    expect(screen.getByText(/no report data available/i)).toBeTruthy();
  });

  it('is marked as a private interview record', () => {
    renderReport();
    expect(screen.getByText('RESUMATE / INTERVIEW RECORD')).toBeTruthy();
    expect(screen.getByText('Private & confidential')).toBeTruthy();
  });
});

describe('an interview that was not scored', () => {
  // How every interview is reported now: the worker writes the report from the
  // transcript, and no answer gets a score.
  const voice = { scores: [], avgScore: null, timer: 1080, report: '## Interview Summary\n\nClear and kind.', mode: 'conversational' };

  it('shows no average and counts no answers', () => {
    renderReport({ report: voice });
    expect(screen.queryByText('Avg Score')).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.queryByText(/questions answered/i)).toBeNull();
    expect(screen.queryByText(/score breakdown/i)).toBeNull();
  });

  it('gives its length once, in the heading, with no box for it alone', () => {
    renderReport({ report: voice });
    expect(screen.getAllByText(/18:00/)).toHaveLength(1);
    expect(screen.getByText('18:00 duration')).toBeTruthy();
    expect(screen.queryByText('Duration')).toBeNull();
  });

  it('still shows what a video interview measured', () => {
    renderReport({ report: { ...voice, mode: 'avatar', eyeContact: 82, violations: 1 } });
    expect(screen.getByText('Face in view')).toBeTruthy();
    expect(screen.getByText('Violations')).toBeTruthy();
    expect(screen.getByText('Duration')).toBeTruthy();
    expect(screen.queryByText('Avg Score')).toBeNull();
  });

  it('shows an average the server kept, without the answers', () => {
    renderReport({ report: { ...voice, avgScore: 7.5 } });
    expect(screen.getByText('7.5')).toBeTruthy();
    expect(screen.getByText('Avg Score')).toBeTruthy();
    expect(screen.queryByText(/questions answered/i)).toBeNull();
  });
});

describe('a terminated interview', () => {
  it('leads with the termination, not the completion', () => {
    renderReport({ report: { ...report, terminated: true, violations: 3 } });
    expect(screen.getByText(/interview terminated/i)).toBeTruthy();
    expect(screen.queryByText(/interview completed/i)).toBeNull();
    expect(screen.getByText(/exceeded proctoring violations limit/i)).toBeTruthy();
  });

  it('reports the violations it counted', () => {
    renderReport({ report: { ...report, violations: 3 } });
    expect(screen.getByText(/proctoring summary/i)).toBeTruthy();
    expect(screen.getByText(/3 violations detected/i)).toBeTruthy();
  });

  it('keeps the proctoring section out of a clean run', () => {
    renderReport();
    expect(screen.queryByText(/proctoring summary/i)).toBeNull();
  });
});

describe('who sees what', () => {
  const managerProps = { candidateId: 1, candidateEmail: 'jane@co.com', viewer: 'manager' };

  it('offers the manager the résumé comparison and a PDF export', () => {
    renderReport(managerProps);
    expect(screen.getByRole('button', { name: /compare résumé and interview/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /export pdf report/i })).toBeTruthy();
  });

  it('offers a candidate neither', () => {
    // Both endpoints are manager-scoped, so for a candidate these buttons could
    // only ever 401 — and the comparison is a tool for assessing them,
    // not one to hand them.
    renderReport({ candidateId: 1, candidateEmail: 'jane@co.com', viewer: 'candidate' });
    expect(screen.queryByRole('button', { name: /compare résumé and interview/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /export pdf report/i })).toBeNull();
  });

  it('defaults to the candidate view', () => {
    // The default matters: a missing prop must not leak the manager tools.
    renderReport({ candidateId: 1, candidateEmail: 'jane@co.com' });
    expect(screen.queryByRole('button', { name: /compare résumé and interview/i })).toBeNull();
  });

  it('shows the manager nothing to run without a candidate to run it on', () => {
    renderReport({ viewer: 'manager' });
    expect(screen.queryByRole('button', { name: /compare résumé and interview/i })).toBeNull();
  });
});

describe('the transcript', () => {
  it('starts collapsed and opens on click', () => {
    renderReport();
    expect(screen.getByText(/\(2 turns\)/i)).toBeTruthy();
    expect(screen.queryByText(/race in our cache layer/i)).toBeNull();

    fireEvent.click(screen.getByText(/conversation transcript/i));
    expect(screen.getByText(/race in our cache layer/i)).toBeTruthy();
  });

  it('tells a screen reader whether it is open', () => {
    renderReport();
    const toggle = screen.getByRole('button', { name: /conversation transcript/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('stays away when there is no transcript', () => {
    renderReport({ report: { ...report, transcript: [] } });
    expect(screen.queryByText(/conversation transcript/i)).toBeNull();
  });
});

describe('no colour literals survive', () => {
  it('renders every colour as a token, not a literal', () => {
    // Two of the originals were light-theme values — a near-white termination
    // banner and a slate-200 bar track — so this guards the class of defect
    // rather than just those two instances.
    //
    // Matching on rgb(), not on '#': jsdom normalises an inline `#FEF2F2` to
    // `rgb(254, 242, 242)` while leaving `var(--x)` untouched, so a hex-shaped
    // assertion here can never fire. The first version of this test was exactly
    // that, and it survived having the white banner put back — a test that
    // claims a guarantee it does not provide is worse than no test.
    const { container } = renderReport({
      report: { ...report, terminated: true, violations: 2 },
      candidateId: 1,
      candidateEmail: 'jane@co.com',
      viewer: 'manager',
    });
    const literals = [...container.querySelectorAll('[style]')]
      .map(el => el.getAttribute('style'))
      .filter(v => /\brgba?\(/.test(v));
    expect(literals).toEqual([]);
  });
});
