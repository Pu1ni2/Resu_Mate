import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import App from '../App';

/* Each portal section's introduction in full on the first visit, then its
 * heading alone: the same paragraph, and on My Resume the sculpture, greeted
 * a candidate every time they came back. */

const SESSION = {
  email: 'dana@x.com', name: 'Dana', has_interview: false, interview_completed: false, interview_config: null,
};
const reply = body => ({ ok: true, status: 200, json: async () => body });
const INTRO = 'Bring your experience together. Your résumé is the starting point for everything that comes next.';

function openPortal() {
  localStorage.setItem('resumate_candidate', JSON.stringify(SESSION));
  localStorage.setItem('resumate_candidate_token', 'cand-jwt');
  return render(
    <MemoryRouter initialEntries={['/candidate/dashboard']}>
      <AppProvider><App /></AppProvider>
    </MemoryRouter>,
  );
}

const sculpture = () => document.querySelector('.cd-welcome-sculpture');

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => reply(String(url).endsWith('/api/chat/candidate/me') ? SESSION : { found: false }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the portal's introductions", () => {
  it('are in full on the first visit, the sculpture with them', async () => {
    openPortal();
    expect(await screen.findByRole('heading', { level: 1, name: 'A little more you.' })).toBeTruthy();
    expect(screen.getByText(INTRO)).toBeTruthy();
    expect(sculpture()).toBeTruthy();
  });

  it('are the heading alone when the candidate comes back', async () => {
    openPortal();
    await screen.findByRole('heading', { level: 1, name: 'A little more you.' });
    cleanup();
    openPortal();
    expect(await screen.findByRole('heading', { level: 1, name: 'A little more you.' })).toBeTruthy();
    expect(screen.queryByText(INTRO)).toBeNull();
    expect(sculpture()).toBeNull();
  });

  it('keep only that the portal was seen, not who saw it', async () => {
    openPortal();
    await screen.findByRole('heading', { level: 1, name: 'A little more you.' });
    expect(localStorage.getItem('resumate_portal_welcomed')).toBe('1');
  });
});
