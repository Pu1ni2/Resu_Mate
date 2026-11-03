import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import App from '../App';

/* The portal's open section is in the address, so a refresh, or Back, keeps
 * it: the portal always opened on My Resume. */

const SESSION = {
  email: 'dana@x.com', name: 'Dana', has_interview: false, interview_completed: false, interview_config: null,
};

function Where() {
  return <output data-testid="where">{useLocation().search}</output>;
}

function openPortal(entry, session = SESSION) {
  localStorage.setItem('resumate_candidate', JSON.stringify(session));
  localStorage.setItem('resumate_candidate_token', 'cand-jwt');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
    String(url).endsWith('/api/chat/candidate/me')
      ? { ok: true, status: 200, json: async () => session }
      : { ok: true, status: 200, json: async () => ({}) }
  ));
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AppProvider><App /></AppProvider>
      <Where />
    </MemoryRouter>,
  );
}

// The dashboard loads on demand, which can take a moment the first time.
const section = name => screen.findByRole('button', { name }, { timeout: 5000 });
const isOpen = async name => (await section(name)).getAttribute('aria-current') === 'page';
const where = () => screen.getByTestId('where').textContent;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the portal's open section", () => {
  it('is the one the address names', async () => {
    openPortal('/candidate/dashboard?section=chat');
    expect(await isOpen('AI Advisor')).toBe(true);
    expect(await isOpen('My Resume')).toBe(false);
  });

  it('is put in the address on opening one, and My Resume needs none', async () => {
    openPortal('/candidate/dashboard');
    fireEvent.click(await section('Analysis'));
    expect(where()).toBe('?section=analysis');
    expect(await isOpen('Analysis')).toBe(true);
    fireEvent.click(await section('My Resume'));
    expect(where()).toBe('');
  });

  it('is My Resume for a section the address names that isn\'t there', async () => {
    openPortal('/candidate/dashboard?section=interview');
    expect(await isOpen('My Resume')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Interview' })).toBeNull();
  });

  it('is the interview, once there is one', async () => {
    openPortal('/candidate/dashboard?section=interview', { ...SESSION, has_interview: true });
    // The section's own link, with its "New" badge; not the header's alert.
    expect(await isOpen(/^Interview\s*New$/)).toBe(true);
  });

  it('is My Resume for a name it doesn\'t know', async () => {
    openPortal('/candidate/dashboard?section=settings');
    expect(await isOpen('My Resume')).toBe(true);
  });
});
