/* Authenticated fetch, for the calls that are not on the axios client.
 *
 * Most of the app goes through services/api.js. A dozen components call fetch()
 * directly — streaming endpoints, file uploads, and code that predates the
 * client. Those need the same two behaviours the interceptor provides: attach
 * the token, and treat a 401 as an expiry rather than a generic failure.
 *
 * Returns the Response untouched, so existing `resp.ok` / `resp.json()` call
 * sites keep working and this can be swapped in one file at a time.
 */
import {
  getToken, getCandidateToken, getRefreshToken, handleUnauthorized, handleCandidateUnauthorized, saveAccessToken,
} from './session';

export const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com')
  : '';

/* Headers with the bearer token attached — and nothing attached when there is
 * no token, rather than a placeholder the backend will reject.
 *
 * Pass whatever else the request needs:
 *   authHeaders({ 'Content-Type': 'application/json' })
 */
export function authHeaders(extra = {}) {
  const token = getToken();
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/* Renew the manager's session with the refresh token. Resolves to the new
 * access token, or null when there is no refresh token or the server refuses it.
 *
 * Access tokens last 30 minutes and refresh tokens 30 days, but nothing used the
 * refresh token, so every manager was signed out half an hour into their work.
 *
 * One renewal at a time: when the token expires, every request in flight gets a
 * 401 together, and they all wait for the same call instead of each making one.
 * Plain fetch on purpose, so a refused renewal can't trigger another renewal.
 */
let renewing = null;

export function refreshSession() {
  if (!renewing) {
    renewing = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return null;
      try {
        const resp = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (!data?.access_token) return null;
        // Signed out, or signed in as someone else, while this was on its way:
        // the session it renewed is gone. Saving it anyway put a signed-out
        // manager's token back, or wrote it over the new manager's.
        if (getRefreshToken() !== refreshToken) return null;
        saveAccessToken(data.access_token);
        return data.access_token;
      } catch {
        return null;
      }
    })().finally(() => {
      renewing = null;
    });
  }
  return renewing;
}

export async function authFetch(url, options = {}) {
  // Rebuilt for the retry so it carries the renewed token; `sent` remembers
  // which token the last attempt carried.
  let sent;
  const send = () => {
    sent = getToken();
    return fetch(url, { ...options, headers: authHeaders(options.headers || {}) });
  };
  let resp = await send();
  // An expired session gets one renewal and one retry before it counts as a
  // sign-out. Sign-in calls are left alone: their 401 means a wrong password.
  const isAuthCall = typeof url === 'string' && url.includes('/auth/');
  if (resp.status === 401 && !isAuthCall && (await refreshSession())) {
    resp = await send();
  }
  if (resp.status === 401) handleUnauthorized(url, sent);
  return resp;
}

/* The interview rooms are reachable two ways: a candidate arriving on their
 * invite link, and a manager previewing the interview they just built. The
 * candidate token wins when both are in the same browser — a manager who tested
 * an interview earlier must not have their credential sent on the candidate's
 * session.
 *
 * Not authFetch: a 401 here is the candidate's problem, and clearing the
 * manager session or firing the manager's redirect would be wrong. */
export function interviewAuthHeaders(extra = {}) {
  const token = getCandidateToken() || getToken();
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/* Same thing for the candidate portal, which holds a different token under a
 * different key and must never be sent a manager's credential. */
export function candidateAuthHeaders(token, extra = {}) {
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/* The candidate portal's fetch: their token on the request, never a manager's,
 * and a 401 read as an expired sign-in. Their session is cleared and App.jsx
 * sends them to sign in again. Before, the calls just failed: an upload said
 * "Upload failed", the advisor said it couldn't connect, a report never came. */
export async function candidateFetch(url, options = {}) {
  const sent = getCandidateToken();
  const resp = await fetch(url, { ...options, headers: candidateAuthHeaders(sent, options.headers || {}) });
  // Only for the sign-in that made the request: a newer one is left alone.
  if (resp.status === 401 && sent === getCandidateToken()) handleCandidateUnauthorized();
  return resp;
}

/* The server's own message from a failed reply, for the person to read: the
 * text in `detail`, else the shared error shape's message. A failed reply's
 * `error` is an object, and pages that showed it as is crashed. */
export async function responseError(resp, fallback) {
  try {
    const body = await resp.json();
    if (typeof body?.detail === 'string' && body.detail) return body.detail;
    if (typeof body?.error?.message === 'string' && body.error.message) return body.error.message;
    if (typeof body?.error === 'string' && body.error) return body.error;
  } catch {
    // Not JSON: the fallback says what failed.
  }
  return fallback;
}
