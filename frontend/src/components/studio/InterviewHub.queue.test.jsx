import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import InterviewHub from './InterviewHub';

/* The Interviews view is a queue: newest first, each saying when it was made
 * or finished, with a search. The sculpture and its invitation are for an
 * empty page; with interviews, the queue leads. */

const ADA = { id: 1, name: 'Ada', email: 'ada@example.com', predicted_role: 'Engineer' };
// As interview-statuses sends them: newest first, in the server's naive UTC.
const STATUSES = {
  statuses: {
    'grace@example.com': { id: 2, status: 'pending', mode: 'avatar', created_at: '2026-11-03T16:20:00', completed_at: null },
    'ada@example.com': { id: 1, status: 'completed', mode: 'conversational', created_at: '2026-10-29T09:30:00', completed_at: '2026-10-30T14:10:00' },
  },
};
const RESULTS = { results: [{ email: 'ada@example.com', candidate_id: 1, report: { timer: 60, report: 'A considered answer.' } }] };
const day = iso => new Date(`${iso}Z`).toLocaleDateString(undefined, { dateStyle: 'medium' });

const response = body => ({ ok: true, status: 200, json: async () => body });
const answer = (statuses = STATUSES, results = RESULTS) => vi.spyOn(globalThis, 'fetch')
  .mockImplementation(async url => response(String(url).endsWith('interview-statuses') ? statuses : results));
const open = (props = {}) => render(<MemoryRouter><InterviewHub candidates={[ADA]} {...props} /></MemoryRouter>);
const people = () => screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
const search = text => fireEvent.change(screen.getByRole('searchbox', { name: 'Search interviews' }), { target: { value: text } });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the interviews queue', () => {
  it('lists the newest first, each saying when it was finished, or made', async () => {
    answer();
    open();
    await screen.findByRole('heading', { name: 'Ada' });
    expect(people()).toEqual(['grace@example.com', 'Ada']);
    expect(screen.getByText(`Invited ${day('2026-11-03T16:20:00')}`)).toBeTruthy();
    expect(screen.getByText(`Finished ${day('2026-10-30T14:10:00')}`)).toBeTruthy();
  });

  it('searches by name, role or address', async () => {
    answer();
    open();
    await screen.findByRole('heading', { name: 'Ada' });
    search('engin');
    expect(people()).toEqual(['Ada']);
    search('GRACE@');
    expect(people()).toEqual(['grace@example.com']);
  });

  it('says when nothing matches, and clears the search', async () => {
    answer();
    open();
    await screen.findByRole('heading', { name: 'Ada' });
    search('zzz');
    expect(screen.getByRole('heading', { name: 'No interviews match “zzz”.' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(people()).toEqual(['grace@example.com', 'Ada']);
  });

  it("with names hidden, doesn't find anyone by the name or address it hides", async () => {
    answer();
    open({ anonymize: true, getDisplayName: (c, i) => `Candidate ${i + 1}` });
    await screen.findByRole('heading', { name: 'Candidate 1' });
    search('ada');
    expect(screen.getByRole('heading', { name: 'No interviews match “ada”.' })).toBeTruthy();
    search('candidate 1');
    expect(people()).toEqual(['Candidate 1']);
  });
});

describe("the view's sculpture", () => {
  const welcome = () => screen.queryByRole('heading', { name: /A résumé opens the door/ });

  it('is for an empty page, with the way to a first interview', async () => {
    answer({ statuses: {} }, { results: [] });
    open();
    expect(await screen.findByRole('heading', { name: /A résumé opens the door/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open a candidate file' }).getAttribute('href')).toBe('/hiring/focus');
    expect(screen.queryByRole('searchbox', { name: 'Search interviews' })).toBeNull();
  });

  it('gives way to the queue once there are interviews', async () => {
    answer();
    open();
    await screen.findByRole('heading', { name: 'Ada' });
    expect(welcome()).toBeNull();
    expect(screen.getByRole('searchbox', { name: 'Search interviews' })).toBeTruthy();
  });
});
