import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { authHeaders, authFetch, candidateAuthHeaders, interviewAuthHeaders } from './authFetch';
import { getToken, clearSession, handleUnauthorized, TOKEN_KEY } from './session';

/* The shipped defect: 21 fetch call sites read the token as
 *   localStorage.getItem('resumate_hm_token') || 'demo-token'
 * and the backend has never accepted 'demo-token'. So a logged-out user sent a
 * credential guaranteed to fail, and because these fetches bypassed the axios
 * interceptor, nothing cleared the session or routed to login. The panel just
 * came back empty.
 */

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe('authHeaders', () => {
  it('attaches the real token', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-abc');
    expect(authHeaders().Authorization).toBe('Bearer jwt-abc');
  });

  it('sends no Authorization header at all when logged out', () => {
    // Not 'Bearer demo-token', and not 'Bearer null' or 'Bearer undefined'
    // either — all three are credentials the server must reject, and all three
    // hide the real cause from whoever is reading the network tab.
    const h = authHeaders();
    expect('Authorization' in h).toBe(false);
  });

  it('never produces a placeholder credential', () => {
    const serialised = JSON.stringify(authHeaders({ 'Content-Type': 'application/json' }));
    expect(serialised).not.toContain('demo-token');
    expect(serialised).not.toContain('null');
    expect(serialised).not.toContain('undefined');
  });

  it('keeps the caller\'s other headers', () => {
    localStorage.setItem(TOKEN_KEY, 't');
    const h = authHeaders({ 'Content-Type': 'application/json', 'X-Thing': '1' });
    expect(h['Content-Type']).toBe('application/json');
    expect(h['X-Thing']).toBe('1');
    expect(h.Authorization).toBe('Bearer t');
  });

  it('does not let a caller override the token by accident', () => {
    localStorage.setItem(TOKEN_KEY, 'real');
    // Extra headers are spread first, so the session token wins.
    expect(authHeaders({ Authorization: 'Bearer stale' }).Authorization).toBe('Bearer real');
  });
});

describe('getToken', () => {
  it('survives localStorage throwing', () => {
    // Safari private mode throws on access rather than returning null.
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(getToken()).toBeNull();
  });
});

describe('authFetch', () => {
  it('passes the body and method through untouched', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ status: 200, ok: true });

    await authFetch('/api/thing', { method: 'POST', body: '{"a":1}' });

    const [, opts] = spy.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe('{"a":1}');
    expect(opts.headers.Authorization).toBe('Bearer tok');
  });

  it('returns the Response as-is so call sites need no rewrite', async () => {
    const body = { status: 200, ok: true, json: async () => ({ results: [1] }) };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(body);
    const resp = await authFetch('/api/thing');
    expect(resp).toBe(body);
    expect(await resp.json()).toEqual({ results: [1] });
  });

  it('treats a 401 as an expiry: clears the session and signals the router', async () => {
    localStorage.setItem(TOKEN_KEY, 'expired');
    localStorage.setItem('resumate_hm_user', '{"id":1}');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ status: 401, ok: false });

    const onUnauthorized = vi.fn();
    window.addEventListener('resumate:unauthorized', onUnauthorized);
    await authFetch('/api/chat/get-all-interview-results');
    window.removeEventListener('resumate:unauthorized', onUnauthorized);

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('leaves a 403 alone — that is a permission answer, not an expiry', async () => {
    localStorage.setItem(TOKEN_KEY, 'valid');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ status: 403, ok: false });
    await authFetch('/api/thing');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('valid');
  });
});

describe('handleUnauthorized', () => {
  it('does not log you out for a failed login attempt', () => {
    localStorage.setItem(TOKEN_KEY, 'other-tab-token');
    // A wrong password is a 401. Reacting to it as an expiry would redirect
    // from the page the user is already on and drop a session another tab holds.
    handleUnauthorized('/api/auth/login');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('other-tab-token');
  });

  it('clears the cached candidate list along with the session', () => {
    localStorage.setItem(TOKEN_KEY, 't');
    localStorage.setItem('resumate_candidates', '[{"id":1,"name":"Someone"}]');

    handleUnauthorized('/api/candidates');

    // AppContext seeds its state from this key on mount. Leaving it behind
    // showed the expired manager's candidates to whoever logged in next on the
    // same browser.
    expect(localStorage.getItem('resumate_candidates')).toBeNull();
  });
});

describe('clearSession', () => {
  it('removes every session key', () => {
    for (const k of ['resumate_hm_token', 'resumate_hm_refresh', 'resumate_hm_user', 'resumate_candidates']) {
      localStorage.setItem(k, 'x');
    }
    clearSession();
    for (const k of ['resumate_hm_token', 'resumate_hm_refresh', 'resumate_hm_user', 'resumate_candidates']) {
      expect(localStorage.getItem(k)).toBeNull();
    }
  });

  it('keeps going if one removal throws', () => {
    const real = window.localStorage.removeItem.bind(window.localStorage);
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(key => {
      if (key === 'resumate_hm_token') throw new Error('quota');
      return real(key);
    });
    localStorage.setItem('resumate_hm_user', 'x');
    clearSession();
    expect(localStorage.getItem('resumate_hm_user')).toBeNull();
  });
});

describe('interviewAuthHeaders', () => {
  it('prefers the candidate token when both are in the browser', () => {
    // A manager who previewed an interview earlier leaves their token behind.
    // The candidate's own credential must win, or the manager's is sent on the
    // candidate's session.
    localStorage.setItem(TOKEN_KEY, 'manager-jwt');
    localStorage.setItem('resumate_candidate_token', 'candidate-jwt');
    expect(interviewAuthHeaders().Authorization).toBe('Bearer candidate-jwt');
  });

  it('falls back to the manager token for the preview flow', () => {
    // A manager testing their own interview has no candidate token.
    localStorage.setItem(TOKEN_KEY, 'manager-jwt');
    expect(interviewAuthHeaders().Authorization).toBe('Bearer manager-jwt');
  });

  it('sends no header when neither token exists', () => {
    // Was `Bearer demo-token` in the conversational room and `Bearer ` (an
    // empty header) in the other — two different wrong answers to one question.
    expect('Authorization' in interviewAuthHeaders()).toBe(false);
  });

  it('keeps the Content-Type the transcript posts need', () => {
    localStorage.setItem('resumate_candidate_token', 'c');
    expect(interviewAuthHeaders({ 'Content-Type': 'application/json' })['Content-Type'])
      .toBe('application/json');
  });
});

describe('candidateAuthHeaders', () => {
  it('uses the candidate token, never the manager one in localStorage', () => {
    localStorage.setItem(TOKEN_KEY, 'manager-jwt');
    const h = candidateAuthHeaders('candidate-jwt');
    expect(h.Authorization).toBe('Bearer candidate-jwt');
    expect(h.Authorization).not.toContain('manager');
  });

  it('omits the header when the candidate has no token', () => {
    expect('Authorization' in candidateAuthHeaders(null)).toBe(false);
  });
});
