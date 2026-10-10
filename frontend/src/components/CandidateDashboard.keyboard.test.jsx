import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import App from '../App';

/* The candidate's sidebar and upload area were divs with onClick, out of reach
 * without a mouse, and the advisor's message box and Send had no names. */

const SESSION = {
  email: 'dana@x.com', name: 'Dana', has_interview: false, interview_completed: false, interview_config: null,
};

function openDashboard() {
  localStorage.setItem('resumate_candidate', JSON.stringify(SESSION));
  localStorage.setItem('resumate_candidate_token', 'cand-jwt');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
    String(url).endsWith('/api/chat/candidate/me')
      ? { ok: true, status: 200, json: async () => SESSION }
      : { ok: true, status: 200, json: async () => ({}) }
  ));
  render(
    <MemoryRouter initialEntries={['/candidate/dashboard']}>
      <AppProvider><App /></AppProvider>
    </MemoryRouter>,
  );
}

// The dashboard loads on demand, which can take a moment the first time.
const findSection = name => screen.findByRole('button', { name }, { timeout: 5000 });

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the candidate's dashboard", () => {
  it('moves between sections from the keyboard, and says which is open', async () => {
    openDashboard();
    expect((await findSection('My Resume')).getAttribute('aria-current')).toBe('page');
    fireEvent.keyDown(screen.getByRole('button', { name: 'AI Advisor' }), { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'AI Advisor' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'My Resume' }).getAttribute('aria-current')).toBeNull();
  });

  it("labels the advisor's message box and its send button", async () => {
    openDashboard();
    fireEvent.keyDown(await findSection('AI Advisor'), { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Message the advisor' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  it('opens the file picker from the upload area on Enter', async () => {
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    openDashboard();
    fireEvent.keyDown(await findSection(/upload your resume.*max 5mb/i), { key: 'Enter' });
    expect(pick).toHaveBeenCalledTimes(1);
  });
});
