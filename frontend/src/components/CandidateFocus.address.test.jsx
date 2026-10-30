import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import CandidateFocus from './CandidateFocus';

/* The candidate file opens the candidate a link names (/hiring/focus?candidate=ID),
 * as the dashboard's cards and its Interviews view link to it, also when the
 * candidate list arrives after the page; and Back to the list leaves the
 * address, so the same file doesn't open again. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Data Scientist', skills: ['Python'], is_resume: true };
const GRACE = { id: 2, name: 'Grace', predicted_role: 'Backend Engineer', skills: ['Go'], is_resume: true };
const realGetContext = HTMLCanvasElement.prototype.getContext;

function Address() {
  const location = useLocation();
  return <p data-testid="address">{location.pathname + location.search}</p>;
}

const page = path => (
  <MemoryRouter initialEntries={[path]}>
    <CandidateFocus />
    <Address />
  </MemoryRouter>
);

// Past the opening animation, to the file itself.
const settle = () => act(async () => { vi.advanceTimersByTime(4000); });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  // The opening animation draws on a canvas, which jsdom doesn't have.
  HTMLCanvasElement.prototype.getContext = () => ({ fillRect: () => {}, fillText: () => {} });
  mocks.app = { candidates: [ADA, GRACE], anonymize: false, getDisplayName: c => c.name, getAvatarGradient: () => 'none' };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.useRealTimers();
  HTMLCanvasElement.prototype.getContext = realGetContext;
  vi.restoreAllMocks();
});

describe('the candidate file, from a link', () => {
  it('opens the candidate the address names', async () => {
    render(page('/hiring/focus?candidate=2'));
    await settle();
    expect(screen.getByRole('heading', { name: 'Grace' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Select a Candidate' })).toBeNull();
  });

  it('opens it when the candidate list arrives after the page', async () => {
    mocks.app = { ...mocks.app, candidates: [] };
    const { rerender } = render(page('/hiring/focus?candidate=2'));
    expect(screen.getByRole('heading', { name: 'Select a Candidate' })).toBeTruthy();

    mocks.app = { ...mocks.app, candidates: [ADA, GRACE] };
    rerender(page('/hiring/focus?candidate=2'));
    await settle();
    expect(screen.getByRole('heading', { name: 'Grace' })).toBeTruthy();
  });

  it('goes back to the list, and the address no longer opens the file', async () => {
    render(page('/hiring/focus?candidate=2'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Select a Candidate' })).toBeTruthy();
    expect(screen.getByTestId('address').textContent).toBe('/hiring/focus');
  });

  it('shows the list for a candidate it does not have', () => {
    render(page('/hiring/focus?candidate=99'));
    expect(screen.getByRole('heading', { name: 'Select a Candidate' })).toBeTruthy();
  });
});
