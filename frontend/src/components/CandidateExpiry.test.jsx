import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import App from '../App';

/* A candidate back the next day found their saved dashboard, and everything on
 * it failed: the sign-in had expired after 24 hours and nothing said so. Opening
 * the dashboard now checks the sign-in. */

const SESSION = {
  email: 'dana@x.com', name: 'Dana', has_interview: false, interview_completed: false, interview_config: null,
};

function server(me) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
    String(url).endsWith('/api/chat/candidate/me')
      ? me
      : { ok: true, status: 200, json: async () => ({}) }
  ));
}

function openDashboard() {
  localStorage.setItem('resumate_candidate', JSON.stringify(SESSION));
  localStorage.setItem('resumate_candidate_token', 'cand-jwt');
  return render(
    <MemoryRouter initialEntries={['/candidate/dashboard']}>
      <AppProvider><App /></AppProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("a candidate's expired sign-in", () => {
  it('sends them to sign in again, and says why', async () => {
    server({ ok: false, status: 401, json: async () => ({ detail: 'Token expired' }) });
    openDashboard();
    expect(await screen.findByText('Your sign-in has expired. Please sign in again.')).toBeTruthy();
    expect(screen.getByText('Candidate Portal')).toBeTruthy();
    expect(localStorage.getItem('resumate_candidate_token')).toBeNull();
  });
});

describe('a current sign-in', () => {
  it('stays, and picks up an interview set up since', async () => {
    server({
      ok: true, status: 200,
      json: async () => ({
        access: true, name: 'Dana', has_interview: true, interview_completed: false,
        interview_config: { role: 'Engineer', mode: 'conversational', interview_id: 9 },
      }),
    });
    openDashboard();
    expect(await screen.findByText('Interview')).toBeTruthy();
    await waitFor(() => expect(JSON.parse(localStorage.getItem('resumate_candidate')).has_interview).toBe(true));
    expect(screen.queryByText(/your sign-in has expired/i)).toBeNull();
  });
});
