import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import InterviewHistory from './InterviewHistory';

/* A candidate's every interview, in their file. Only the newest was shown
 * anywhere, so an earlier round's report was out of reach once another was
 * made. */

const INTERVIEWS = [
  { interview_id: 12, role: 'Data Engineer', status: 'pending', mode: 'avatar', email: 'ada@x.com',
    created_at: '2026-11-02T10:00:00', completed_at: null, report: null },
  { interview_id: 11, role: 'Data Engineer', status: 'completed', mode: 'conversational', email: 'ada@x.com',
    created_at: '2026-10-30T10:00:00', completed_at: '2026-10-30T10:20:00', report: { report: '## Round one went well', timer: 900 } },
];

const answer = (body, ok = true) => vi.spyOn(globalThis, 'fetch')
  .mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a candidate's interview history", () => {
  it('lists every interview, newest first, and opens a finished one\'s report', async () => {
    const fetchMock = answer({ interviews: INTERVIEWS });
    render(<InterviewHistory candidateId={4} />);
    const list = await screen.findByRole('list', { name: 'Interviews' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map(row => row.querySelector('span').textContent)).toEqual([
      expect.stringMatching(/^Video · Waiting to be taken · created /),
      expect.stringMatching(/^Voice · Completed · finished /),
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/chat\/candidates\/4\/interviews$/);
    // Only the finished one has a report to open.
    expect(within(rows[0]).queryByRole('button', { name: /view report/i })).toBeNull();
    fireEvent.click(within(rows[1]).getByRole('button', { name: /view report/i }));
    expect(screen.getByText('Round one went well')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /all interviews/i }));
    expect(screen.getByRole('list', { name: 'Interviews' })).toBeTruthy();
  });

  it('says when there are none yet', async () => {
    answer({ interviews: [] });
    render(<InterviewHistory candidateId={4} />);
    expect(await screen.findByText('No interviews yet.')).toBeTruthy();
  });

  it('says a failed load failed, rather than that there are none', async () => {
    answer({ detail: 'Please try again.' }, false);
    render(<InterviewHistory candidateId={4} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('No interviews yet.')).toBeNull();
  });
});
