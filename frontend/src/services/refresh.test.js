import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AxiosError } from 'axios';

import api from './api';
import { authFetch, refreshSession } from './authFetch';
import { getToken, TOKEN_KEY } from './session';

/* Access tokens last 30 minutes, refresh tokens 30 days. An expired session is
 * renewed once and the request retried; only a failed renewal signs out. */

const REFRESH_KEY = 'resumate_hm_refresh';

function json(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

/* A fake server: the old token is refused, the new one accepted, and
 * /auth/refresh answers with `renewal`. Returns the fetch spy. */
function server({ renewal = json(200, { access_token: 'new-jwt' }), retry401 = false } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    if (String(url).endsWith('/api/auth/refresh')) return renewal;
    const auth = options.headers?.Authorization;
    if (auth === 'Bearer new-jwt' && !retry401) return json(200, { ok: true });
    return json(401, { detail: 'expired' });
  });
}

const refreshCalls = spy => spy.mock.calls.filter(([url]) => String(url).endsWith('/api/auth/refresh'));

let unauthorized;
const onUnauthorized = () => { unauthorized += 1; };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOKEN_KEY, 'old-jwt');
  localStorage.setItem(REFRESH_KEY, 'refresh-jwt');
  unauthorized = 0;
  window.addEventListener('resumate:unauthorized', onUnauthorized);
  vi.restoreAllMocks();
});

afterEach(() => {
  window.removeEventListener('resumate:unauthorized', onUnauthorized);
  localStorage.clear();
});

describe('authFetch and an expired session', () => {
  it('renews once and retries with the new token', async () => {
    const spy = server();
    const resp = await authFetch('/api/candidates');
    expect(resp.status).toBe(200);
    expect(getToken()).toBe('new-jwt');
    const [, retry] = spy.mock.calls.at(-1);
    expect(retry.headers.Authorization).toBe('Bearer new-jwt');
    expect(JSON.parse(refreshCalls(spy)[0][1].body)).toEqual({ refresh_token: 'refresh-jwt' });
    expect(unauthorized).toBe(0);
  });

  it('signs out when the renewal is refused', async () => {
    server({ renewal: json(401, { detail: 'Invalid refresh token' }) });
    const resp = await authFetch('/api/candidates');
    expect(resp.status).toBe(401);
    expect(getToken()).toBeNull();
    expect(unauthorized).toBe(1);
  });

  it('signs out when the retry is refused too, after a single renewal', async () => {
    const spy = server({ retry401: true });
    await authFetch('/api/candidates');
    expect(refreshCalls(spy)).toHaveLength(1);
    expect(unauthorized).toBe(1);
  });

  it('makes one renewal for many requests that expire together', async () => {
    const spy = server();
    const results = await Promise.all(['/api/a', '/api/b', '/api/c'].map(u => authFetch(u)));
    expect(results.map(r => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls(spy)).toHaveLength(1);
  });

  it('signs out without calling the server when there is no refresh token', async () => {
    localStorage.removeItem(REFRESH_KEY);
    const spy = server();
    await authFetch('/api/candidates');
    expect(refreshCalls(spy)).toHaveLength(0);
    expect(unauthorized).toBe(1);
  });

  it('never renews for sign-in calls, whose 401 is a wrong password', async () => {
    const spy = server();
    const resp = await authFetch('/api/auth/login', { method: 'POST' });
    expect(resp.status).toBe(401);
    expect(refreshCalls(spy)).toHaveLength(0);
    expect(unauthorized).toBe(0);
    expect(getToken()).toBe('old-jwt');
  });

  it('treats a network failure during renewal as a failed renewal', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      if (String(url).endsWith('/api/auth/refresh')) throw new TypeError('Failed to fetch');
      return json(401, {});
    });
    expect(await refreshSession()).toBeNull();
  });
});

describe('the axios client and an expired session', () => {
  let adapter;

  beforeEach(() => {
    adapter = vi.fn(async config => {
      const response = { status: 200, statusText: 'OK', headers: {}, config, data: { candidates: [] } };
      if (config.headers.Authorization === 'Bearer new-jwt') return response;
      const refused = { ...response, status: 401, statusText: 'Unauthorized', data: { detail: 'expired' } };
      throw new AxiosError('Request failed with status code 401', AxiosError.ERR_BAD_REQUEST, config, null, refused);
    });
    api.defaults.adapter = adapter;
  });

  it('renews once and replays the request with the new token', async () => {
    const spy = server();
    const resp = await api.get('/candidates');
    expect(resp.data).toEqual({ candidates: [] });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(adapter.mock.calls[1][0].headers.Authorization).toBe('Bearer new-jwt');
    expect(refreshCalls(spy)).toHaveLength(1);
    expect(unauthorized).toBe(0);
  });

  it('rejects and signs out when the renewal is refused', async () => {
    server({ renewal: json(401, {}) });
    await expect(api.get('/candidates')).rejects.toMatchObject({ response: { status: 401 } });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(unauthorized).toBe(1);
  });

  it('never renews for sign-in calls', async () => {
    const spy = server();
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy();
    expect(refreshCalls(spy)).toHaveLength(0);
    expect(unauthorized).toBe(0);
  });
});
