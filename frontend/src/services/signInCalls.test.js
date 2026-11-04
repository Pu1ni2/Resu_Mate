import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { authFetch } from './authFetch';
import { getToken, isSignInCall, TOKEN_KEY } from './session';

/* Only the sign-in calls, whose 401 means a wrong password or code, are left
 * without a renewal. All of /auth/ was, so the account's own calls (its
 * profile, "Hide names") just failed once the session had expired. */

const REFRESH_KEY = 'resumate_hm_refresh';

function json(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

// The old token is refused, the renewed one accepted.
function server() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    if (String(url).endsWith('/api/auth/refresh')) return json(200, { access_token: 'new-jwt' });
    return options.headers?.Authorization === 'Bearer new-jwt' ? json(200, { ok: true }) : json(401, { detail: 'expired' });
  });
}

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

describe('a sign-in call', () => {
  it('is signing in, registering, renewing, a password reset or a candidate code', () => {
    for (const url of ['/api/auth/login', '/auth/register', '/api/auth/refresh', '/api/auth/forgot-password',
      '/api/auth/reset-password', '/api/auth/candidate/send-otp', '/api/auth/candidate/verify-otp']) {
      expect(isSignInCall(url)).toBe(true);
    }
  });

  it("isn't the account's own calls, or any other", () => {
    for (const url of ['/api/auth/me', '/api/auth/preferences', '/api/auth/delete-account', '/api/candidates', undefined]) {
      expect(isSignInCall(url)).toBe(false);
    }
  });
});

describe("the account's own call, after the session expired", () => {
  it('renews once and goes through', async () => {
    server();
    const resp = await authFetch('/api/auth/preferences', { method: 'PUT', body: JSON.stringify({ hide_names: true }) });
    expect(resp.status).toBe(200);
    expect(getToken()).toBe('new-jwt');
    expect(unauthorized).toBe(0);
  });
});
