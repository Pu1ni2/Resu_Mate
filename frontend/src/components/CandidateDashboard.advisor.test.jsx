import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import App from '../App';
import { TOAST_EVENT } from '../services/notify';

/* The advisor answered from each mode's earlier conversation, but the portal
 * started blank every time, and had no way to start a mode over. */

const SESSION = {
  email: 'dana@x.com', name: 'Dana', has_interview: false, interview_completed: false, interview_config: null,
};
const COACHED = [
  { role: 'user', content: 'Review my resume' },
  { role: 'assistant', content: 'Lead each line with what changed.' },
];

let server;
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

function openAdvisor() {
  localStorage.setItem('resumate_candidate', JSON.stringify(SESSION));
  localStorage.setItem('resumate_candidate_token', 'cand-jwt');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const path = Object.keys(server).find(p => String(url).endsWith(p));
    return path ? server[path](options) : reply({});
  });
  render(
    <MemoryRouter initialEntries={['/candidate/dashboard']}>
      <AppProvider><App /></AppProvider>
    </MemoryRouter>,
  );
}

const goTo = async name => fireEvent.click(await screen.findByRole('button', { name }, { timeout: 5000 }));
const mode = name => fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
const cleared = () => fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/advisor/history/clear'));

let toasts;
const onToast = e => toasts.push(e.detail);

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  toasts = [];
  window.addEventListener(TOAST_EVENT, onToast);
  server = {
    '/api/chat/candidate/me': () => reply(SESSION),
    '/api/advisor/history': () => reply({ history: { general: [], resume_coach: COACHED, interview_prep: [], career_advisor: [] } }),
    '/api/advisor/history/clear': () => reply({ cleared: 'resume_coach' }),
  };
});

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, onToast);
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the advisor's earlier conversations", () => {
  it('show again in their own mode', async () => {
    openAdvisor();
    await goTo('AI Advisor');
    mode('Resume Coach');
    expect(await screen.findByText('Lead each line with what changed.')).toBeTruthy();
    mode('General');
    expect(screen.queryByText('Lead each line with what changed.')).toBeNull();
  });

  it('start over on "New conversation", which the advisor forgets too', async () => {
    openAdvisor();
    await goTo('AI Advisor');
    mode('Resume Coach');
    await screen.findByText('Lead each line with what changed.');
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    await waitFor(() => expect(screen.queryByText('Lead each line with what changed.')).toBeNull());
    expect(cleared()).toHaveLength(1);
    expect(JSON.parse(cleared()[0][1].body)).toEqual({ mode: 'resume_coach' });
    expect(screen.queryByRole('button', { name: 'New conversation' })).toBeNull();
  });

  it('stay when starting over fails, and say so', async () => {
    server['/api/advisor/history/clear'] = () => reply({ detail: 'Try again in a moment.' }, 503);
    openAdvisor();
    await goTo('AI Advisor');
    mode('Resume Coach');
    await screen.findByText('Lead each line with what changed.');
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    await waitFor(() => expect(toasts).toEqual([{ message: 'Try again in a moment.', type: 'error' }]));
    expect(screen.getByText('Lead each line with what changed.')).toBeTruthy();
  });

  it('offer no "New conversation" in a mode with none', async () => {
    openAdvisor();
    await goTo('AI Advisor');
    expect(screen.queryByRole('button', { name: 'New conversation' })).toBeNull();
  });

  it("leave the page blank when they can't be read", async () => {
    server['/api/advisor/history'] = () => reply({}, 500);
    openAdvisor();
    await goTo('AI Advisor');
    mode('Resume Coach');
    expect(screen.getByRole('heading', { name: 'Resume Coach' })).toBeTruthy();
  });
});
