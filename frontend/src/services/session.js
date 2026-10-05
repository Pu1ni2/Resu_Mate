/* One owner for the hiring-manager session.
 *
 * The token key was read directly by 21 raw fetch() calls across 13 files, each
 * with its own `|| 'demo-token'` fallback. The backend has never accepted
 * 'demo-token', so a logged-out user did not get sent to the login screen —
 * they got a 401 dressed up as whatever the call site did with a failed
 * response, which in most cases was an empty panel and no explanation.
 *
 * Those fetches also bypassed the axios interceptor, which is where the real
 * 401 handling lives. So an expired session behaved differently depending on
 * which button you pressed.
 *
 * localStorage access is wrapped throughout: it throws, not returns null, in
 * Safari private mode and when a storage quota is exceeded.
 */

export const TOKEN_KEY = 'resumate_hm_token';
const REFRESH_KEY = 'resumate_hm_refresh';
const USER_KEY = 'resumate_hm_user';
// Cached candidate list. Cleared with the session: it is the previous
// manager's data, and AppContext seeds state from it on mount.
const CANDIDATE_CACHE_KEY = 'resumate_candidates';
// The candidate portal's own token. A different principal entirely: it must
// never be cleared by a manager's expiry, nor sent on a manager's request.
export const CANDIDATE_TOKEN_KEY = 'resumate_candidate_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function getCandidateToken() {
  try {
    return localStorage.getItem(CANDIDATE_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function saveSession(token, refreshToken, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable. The token stays in memory for this page, and the
    // next reload lands on login — better than failing the sign-in outright.
  }
}

export function getRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_KEY) || null;
  } catch {
    return null;
  }
}

/* Store a renewed access token, keeping the refresh token and user as they are. */
export function saveAccessToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable: the renewed token is lost and the next request
    // falls back to signing in again, as before.
  }
}

export function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  for (const key of [TOKEN_KEY, REFRESH_KEY, USER_KEY, CANDIDATE_CACHE_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing useful to do; carry on and clear the rest.
    }
  }
}

// The rest of the candidate portal's session, next to its token.
const CANDIDATE_SESSION_KEY = 'resumate_candidate';
const CANDIDATE_REPORT_KEY = 'resumate_interview_report';

/* Sign the candidate out: their token, their cached session and their saved
 * report. The manager's keys are left alone, since the two are separate
 * identities that can share a browser. Logout used to remove only the cached
 * session and keep the token, which then outranked a manager's token on
 * interview requests (interviewAuthHeaders prefers the candidate's). */
export function clearCandidateSession() {
  for (const key of [CANDIDATE_TOKEN_KEY, CANDIDATE_SESSION_KEY, CANDIDATE_REPORT_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing useful to do; carry on and clear the rest.
    }
  }
}

/* True for requests where a 401 is the expected answer and must not log the
 * user out — signing in with a wrong password is a 401, and treating it as an
 * expiry would fire a redirect from the page they are already on. */
function isAuthFlow(url) {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  if (path === '/hiring/login' || path === '/hiring/register') return true;
  return typeof url === 'string' && url.includes('/auth/');
}

/* Session expired: clear it and let App.jsx route to login via React Router.
 *
 * Deliberately not window.location.href — a hard reload kills in-progress
 * Jarvis conversations, voice sessions and uploads. That is only the fallback
 * for browsers without CustomEvent.
 *
 * `sentToken`, when given, is the access token the refused request carried. A
 * 401 for a token that is no longer the current one says nothing about the
 * current session (the manager signed out, or someone else signed in, while it
 * was on its way), so that session is left alone.
 */
export function handleUnauthorized(url, sentToken) {
  if (isAuthFlow(url)) return;
  if (sentToken !== undefined && sentToken !== getToken()) return;
  clearSession();
  try {
    window.dispatchEvent(new CustomEvent('resumate:unauthorized'));
  } catch {
    window.location.href = '/hiring/login';
  }
}
