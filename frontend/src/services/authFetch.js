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
import { getToken, handleUnauthorized } from './session';

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

export async function authFetch(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  if (resp.status === 401) handleUnauthorized(url);
  return resp;
}

/* Same thing for the candidate portal, which holds a different token under a
 * different key and must never be sent a manager's credential. */
export function candidateAuthHeaders(token, extra = {}) {
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
