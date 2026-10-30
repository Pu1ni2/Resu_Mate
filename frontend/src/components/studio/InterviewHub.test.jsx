import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import InterviewHub from './InterviewHub';

/* The dashboard's Interviews view: each candidate's latest interview from the
 * saved statuses, filtered, opening its report; a failed load that says so;
 * no score on any row; and hidden names kept hidden. */

const ADA = { id: 1, name: 'Ada', email: 'ada@example.com', predicted_role: 'Engineer' };
const STATUSES = {
  statuses: {
    'ada@example.com': { id: 1, status: 'completed', mode: 'conversational' },
    'grace@example.com': { id: 2, status: 'pending', mode: 'avatar' },
  },
};
// An interview from before interviews stopped being scored.
const RESULTS = { results: [{ email: 'ada@example.com', candidate_id: 1, report: { scores: [8], timer: 60, report: 'A considered answer.' } }] };

const response = body => ({ ok: true, status: 200, json: async () => body });
const answer = (statuses = STATUSES, results = RESULTS) => vi.spyOn(globalThis, 'fetch')
  .mockImplementation(async url => response(String(url).endsWith('interview-statuses') ? statuses : results));
const open = (props = {}) => render(<MemoryRouter><InterviewHub candidates={[ADA]} {...props} /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Interviews view', () => {
  it('lists the saved interviews, filters them, and opens a completed one\'s report', async () => {
    answer();
    open();
    expect(await screen.findByRole('heading', { name: 'Ada' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All interviews' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Invitations' }));
    expect(screen.getByRole('button', { name: 'Invitations' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('heading', { name: 'Ada' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'grace@example.com' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    fireEvent.click(screen.getByRole('button', { name: 'View report' }));
    expect(screen.getByRole('heading', { name: 'Interview Completed' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to interviews' }));
    expect(screen.getByRole('heading', { name: 'Ada' })).toBeTruthy();
  });

  it('counts the interviews by where they are', async () => {
    answer();
    open();
    await screen.findByRole('heading', { name: 'Ada' });
    const counts = document.querySelector('.sd-interview-counts').textContent;
    expect(counts).toBe('Invitations01In progress00Completed01');
  });

  it('shows no score on a row, even for an interview that was scored, but says what kind it was', async () => {
    answer();
    open();
    await screen.findByRole('heading', { name: 'Ada' });
    expect(screen.queryByText(/\/ 10/)).toBeNull();
    expect(screen.queryByText('8.0')).toBeNull();
    expect(screen.getByText('Voice interview')).toBeTruthy();
    expect(screen.getByText('Avatar interview')).toBeTruthy();
  });

  it('leads an invited candidate to their file', async () => {
    answer({ statuses: { 'ada@example.com': { id: 1, status: 'pending', mode: 'conversational' } } }, { results: [] });
    open();
    const link = await screen.findByRole('link', { name: 'Open candidate file for Ada' });
    expect(link.getAttribute('href')).toBe('/hiring/focus?candidate=1');
  });

  it('keeps hidden names hidden', async () => {
    answer();
    open({ anonymize: true, getDisplayName: (c, i) => `Candidate ${i + 1}` });
    expect(await screen.findByRole('heading', { name: 'Candidate 1' })).toBeTruthy();
    // Grace isn't in the uploads, so there is no stand-in name to give her.
    expect(screen.getByRole('heading', { name: 'Candidate' })).toBeTruthy();
    expect(screen.queryByText('Ada')).toBeNull();
    expect(screen.queryByText('grace@example.com')).toBeNull();
  });

  it('says a failed load failed, and offers another try, instead of an empty history', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500, json: async () => ({ detail: 'Please try again.' }) });
    open();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Your next conversation starts here.')).toBeNull();
    expect(document.querySelector('.sd-interview-counts').textContent).toBe('Invitations—In progress—Completed—');

    fetcher.mockResolvedValue(response({ statuses: {}, results: [] }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('Your next conversation starts here.')).toBeTruthy());
  });
});
