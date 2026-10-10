import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { candidateFetch } from './authFetch';
import { CANDIDATE_TOKEN_KEY, TOKEN_KEY } from './session';

/* The candidate portal's calls failed quietly when the sign-in had expired: an
 * upload said "Upload failed", the advisor said it couldn't connect, and the
 * report never came. A 401 now clears the candidate's session and sends them to
 * sign in again, leaving a manager's session in the same browser alone. */

const EVENT = 'resumate:candidate-unauthorized';
let fired;
const count = () => { fired += 1; };

function answers(status) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: status < 400, status, json: async () => ({}) });
}

beforeEach(() => {
  localStorage.clear();
  fired = 0;
  window.addEventListener(EVENT, count);
  localStorage.setItem(CANDIDATE_TOKEN_KEY, 'cand-jwt');
  localStorage.setItem('resumate_candidate', JSON.stringify({ email: 'dana@x.com' }));
  localStorage.setItem(TOKEN_KEY, 'manager-jwt');
});

afterEach(() => {
  window.removeEventListener(EVENT, count);
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('candidateFetch', () => {
  it("sends the candidate's token, never the manager's", async () => {
    const spy = answers(200);
    await candidateFetch('/api/advisor/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(spy.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer cand-jwt' });
  });

  it('reads a 401 as an expired sign-in: their session goes, and the app is told', async () => {
    answers(401);
    const resp = await candidateFetch('/api/chat/candidate/my-report');
    expect(resp.status).toBe(401);
    expect(fired).toBe(1);
    expect(localStorage.getItem(CANDIDATE_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem('resumate_candidate')).toBeNull();
  });

  it("leaves the manager's session alone", async () => {
    answers(401);
    await candidateFetch('/api/chat/candidate/my-report');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('manager-jwt');
  });

  it('leaves a newer sign-in alone', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      // They signed in again while this request was on its way.
      localStorage.setItem(CANDIDATE_TOKEN_KEY, 'new-cand-jwt');
      return { ok: false, status: 401, json: async () => ({}) };
    });
    await candidateFetch('/api/chat/candidate/my-report');
    expect(fired).toBe(0);
    expect(localStorage.getItem(CANDIDATE_TOKEN_KEY)).toBe('new-cand-jwt');
  });

  it('does nothing for other failures', async () => {
    answers(500);
    await candidateFetch('/api/advisor/chat');
    expect(fired).toBe(0);
    expect(localStorage.getItem(CANDIDATE_TOKEN_KEY)).toBe('cand-jwt');
  });
});
