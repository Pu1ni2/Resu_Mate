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
 */
export function handleUnauthorized(url) {
  if (isAuthFlow(url)) return;
  clearSession();
  try {
    window.dispatchEvent(new CustomEvent('resumate:unauthorized'));
  } catch {
    window.location.href = '/hiring/login';
  }
}
