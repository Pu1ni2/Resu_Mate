import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import RecentRuns from './RecentRuns';
import PipelineWizard from './PipelineWizard';

/* The screening runs a workspace keeps, under the brief, to open again: a run
 * lived only in the page, and leaving it meant screening again. */

const run = (id, role, screened = 12) => ({ run_id: id, role, total_screened: screened, created_at: '2026-11-02T15:04:00' });
const when = new Date('2026-11-02T15:04:00Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function serve(reply) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => reply());
}
const list = runs => () => ({ ok: true, status: 200, json: async () => ({ runs }) });

beforeEach(() => {
  localStorage.setItem('resumate_hm_token', 'test-token');
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('the earlier screening runs', () => {
  it('are listed as sent, newest first, with how many were screened and when', async () => {
    serve(list([run(9, 'Backend Engineer'), run(4, 'Designer', 1)]));
    render(<RecentRuns onOpen={vi.fn()} />);
    const rows = await screen.findAllByRole('button');
    expect(rows.map(row => row.textContent)).toEqual([
      `Backend Engineer12 screened · ${when}`,
      `Designer1 screened · ${when}`,
    ]);
    expect(screen.getByRole('heading', { name: 'Earlier runs' })).toBeTruthy();
  });

  it('open one by its id', async () => {
    serve(list([run(9, 'Backend Engineer'), run(4, 'Designer')]));
    const onOpen = vi.fn();
    render(<RecentRuns onOpen={onOpen} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Designer/ }));
    expect(onOpen).toHaveBeenCalledWith(4);
  });

  it('show five, and the rest on asking', async () => {
    serve(list([7, 6, 5, 4, 3, 2, 1].map(id => run(id, `Role ${id}`))));
    render(<RecentRuns onOpen={vi.fn()} />);
    await screen.findByRole('button', { name: /^Role 7/ });
    expect(screen.queryByRole('button', { name: /^Role 2/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all 7' }));
    expect(screen.getByRole('button', { name: /^Role 1/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it.each([
    ['there are none', list([])],
    ['the server refuses', () => ({ ok: false, status: 500, json: async () => ({}) })],
    ['the network fails', () => { throw new TypeError('Failed to fetch'); }],
  ])('show nothing when %s', async (_, reply) => {
    const spy = serve(reply);
    const { container } = render(<RecentRuns onOpen={vi.fn()} />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await Promise.resolve();
    expect(container.innerHTML).toBe('');
  });
});

describe('the brief', () => {
  it('lists the earlier runs when it can open them', async () => {
    serve(list([run(9, 'Backend Engineer')]));
    render(<PipelineWizard candidateCount={3} onComplete={vi.fn()} onOpenRun={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /^Backend Engineer\s*12 screened/ })).toBeTruthy();
  });

  it("doesn't ask for them when it can't", () => {
    const spy = serve(list([run(9, 'Backend Engineer')]));
    render(<PipelineWizard candidateCount={3} onComplete={vi.fn()} />);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Earlier runs' })).toBeNull();
  });
});
