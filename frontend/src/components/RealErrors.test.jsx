import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { responseError } from '../services/authFetch';
import { TOAST_EVENT } from '../services/notify';
import useFocusChat from '../hooks/useFocusChat';
import EmailComposer from './focus/EmailComposer';
import CandidateDashboard from './CandidateDashboard';

/* The server answered failures with 200 and the exception's text, which these
 * pages showed as the answer. Failures are real errors now, with a plain
 * message, and a failed reply's `error` is an object: shown as is, it crashed. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const failure = (status, detail) => ({
  ok: false, status,
  json: async () => ({ error: { type: 'http_error', message: detail }, detail }),
});

let toasts;
const onToast = e => toasts.push(e.detail);

beforeEach(() => {
  toasts = [];
  window.addEventListener(TOAST_EVENT, onToast);
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, onToast);
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('responseError', () => {
  it("reads the server's message from any failed reply", async () => {
    expect(await responseError(failure(502, 'Try again.'), 'x')).toBe('Try again.');
    expect(await responseError({ json: async () => ({ error: { message: 'From the shape' } }) }, 'x')).toBe('From the shape');
    expect(await responseError({ json: async () => ({ error: 'Plain' }) }, 'x')).toBe('Plain');
    expect(await responseError({ json: async () => { throw new SyntaxError('not JSON'); } }, 'Fallback')).toBe('Fallback');
  });
});

describe('the focus chat', () => {
  it("shows the server's message as the error, not as an answer", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(failure(502, "The assistant couldn't answer just now. Please try again."));
    const { result } = renderHook(() => useFocusChat({
      apiBase: '', focusCandidate: { id: 1, name: 'Ada' }, getCandidatePayload: () => ({}),
    }));
    await act(async () => { await result.current.sendMessage('How strong is Ada?'); });
    expect(result.current.messages.at(-1)).toEqual({
      role: 'assistant', content: "**Error:** The assistant couldn't answer just now. Please try again.",
    });
  });
});

describe('the email composer', () => {
  it('says the draft failed, rather than writing a generic email', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(failure(502, "Couldn't draft the email. Please try again."));
    render(<EmailComposer focusCandidate={{ id: 1, name: 'Ada', text: 'ada@x.com' }} getCandidatePayload={() => ({})} />);
    fireEvent.click(screen.getByRole('button', { name: 'Interview Invite' }));
    await waitFor(() => expect(toasts).toEqual([{ message: "Couldn't draft the email. Please try again.", type: 'error' }]));
    expect(screen.queryByDisplayValue(/thank you for your interest/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Interview Invite' })).toBeTruthy();
  });
});

describe("the candidate's advisor", () => {
  it("shows the server's message, not the exception text", async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
      String(url).endsWith('/api/advisor/chat')
        ? failure(502, "Sorry, I couldn't answer that just now. Please try again.")
        : { ok: true, status: 200, json: async () => ({}) }
    ));
    localStorage.setItem('resumate_candidate_token', 'cand-jwt');
    mocks.app = { candidateSession: { email: 'dana@x.com', name: 'Dana' }, setCandidateSession: vi.fn() };
    render(<MemoryRouter><CandidateDashboard /></MemoryRouter>);
    fireEvent.click(screen.getByText('AI Advisor'));
    fireEvent.click(screen.getByText('Review my resume'));
    expect(await screen.findByText("Sorry, I couldn't answer that just now. Please try again.")).toBeTruthy();
  });
});
