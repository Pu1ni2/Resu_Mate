import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const open = (pipelineResult, props = {}) => render(
  <MemoryRouter>
    <ATSResultsView pipelineResult={pipelineResult} onBack={vi.fn()} onRunAgain={vi.fn()} {...props} />
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

describe('where the results sit', () => {
  it("head the page on their own, and sit under the frame's heading in the workspace", () => {
    const { unmount } = open(run({}));
    expect(screen.getByRole('heading', { level: 1, name: 'Shortlist — Backend Engineer' })).toBeTruthy();
    unmount();
    open(run({}), { embedded: true });
    expect(screen.getByRole('heading', { level: 2, name: 'Shortlist — Backend Engineer' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('set no text smaller than 11px, pills included', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ statuses: { 'ada@x.com': { status: 'completed', mode: 'conversational' } } }),
    });
    const { container } = open(run({}), { embedded: true });
    await screen.findByText('Done');
    const sizes = [...container.querySelectorAll('[class]')].flatMap(el =>
      [...el.getAttribute('class').matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)].map(m => Number(m[1])));
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter(size => size < 11)).toEqual([]);
  });

  it('lead the page in the workspace when the frame has no heading of its own', () => {
    open(run({}), { embedded: true, leads: true });
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Shortlist — Backend Engineer']);
  });
});

/* The bulk action was fixed to the screen from the first moment, over the
 * people before their evidence was read; on a phone its button took four
 * lines over them. It follows the list. */
describe('the bulk action', () => {
  const BEA = { ...RESULT, candidate_id: 2, name: 'Bea', email: 'bea@x.com' };
  const two = () => open(run({ results: [RESULT, BEA], shortlist: [RESULT, BEA], total_screened: 2 }));

  it('comes after every person, their file and their details', () => {
    two();
    const bar = screen.getByRole('group', { name: 'The selected candidates' });
    expect(bar.textContent).toContain('2 selected');
    const before = [
      ...screen.getAllByRole('link', { name: /’s file \(new tab\)$/ }),
      ...screen.getAllByRole('button', { name: /^Show details for / }),
    ];
    expect(before).toHaveLength(4);
    for (const el of before) expect(el.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sits in the page, not fixed over it', () => {
    two();
    const bar = screen.getByRole('group', { name: 'The selected candidates' });
    expect(bar.className).not.toMatch(/\b(fixed|sticky)\b/);
  });

  it('goes when no one is selected', () => {
    two();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('group', { name: 'The selected candidates' })).toBeNull();
  });
});

describe('selecting from the screening results', () => {
  // Compared by counts, a tab with as many rows as there were picks on
  // another offered "Deselect all", and pressing it cleared those picks.
  const person = (id, name, verdict, score) => ({ ...RESULT, candidate_id: id, name, email: `${name.toLowerCase()}@x.com`, verdict, ats_score: score });
  const FOUR = [person(1, 'Ada', 'Strong Fit', 92), person(2, 'Ben', 'Strong Fit', 90),
    person(3, 'Cy', 'Good Fit', 70), person(4, 'Di', 'Good Fit', 65)];
  const tab = name => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
  const selectAllButton = () => screen.getByRole('button', { name: /^(Select all|Deselect all)$/ });
  // The count beside it (the action bar below has one of its own).
  const count = () => selectAllButton().parentElement.querySelector('span').textContent.trim();

  it('says whether the rows shown are selected by who is selected, and keeps other tabs\' picks', () => {
    // Nothing shortlisted, so nothing is selected to begin with.
    open(run({ results: FOUR, shortlist: [], stats: { strong_fit: 2, good_fit: 2, consider: 0, no_match: 0 } }));
    tab('Strong Fit');
    fireEvent.click(selectAllButton());
    expect(count()).toBe('2 selected');
    tab('Good Fit');
    // As many rows as picks, but none of these is picked.
    expect(selectAllButton().textContent).toBe('Select all');
    expect(count()).toBe('2 selected, 2 on other tabs');
    fireEvent.click(selectAllButton());
    expect(count()).toBe('4 selected, 2 on other tabs');
    tab('Strong Fit');
    expect(selectAllButton().textContent).toBe('Deselect all');
    fireEvent.click(selectAllButton());
    // Only this tab's rows were let go.
    expect(count()).toBe('2 selected, 2 on other tabs');
  });
});

describe("a screened candidate's file", () => {
  // Each result named the person in plain text, with no way to their file.
  it('opens from their name, in a new tab so the results stay', () => {
    open(run({ assessed: ['role'], excluded: 0 }));
    const link = screen.getByRole('link', { name: 'Open Ada’s file (new tab)' });
    expect(link.getAttribute('href')).toBe('/hiring/focus?candidate=1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('carries a kept run, as the way back to these results', () => {
    open(run({ run_id: 7 }));
    const link = screen.getByRole('link', { name: 'Open Ada’s file (new tab)' });
    expect(link.getAttribute('href')).toBe('/hiring/focus?candidate=1&run=7');
  });
});
