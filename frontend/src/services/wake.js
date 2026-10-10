/* On Render's free plan the backend sleeps when idle and takes up to a minute
 * to start, and the first request just hung with no word why. The app asks it
 * on load; if it hasn't answered in 5 seconds, one notice says it is starting,
 * and another says when it is ready. */
import { API_BASE } from './authFetch';
import { toast } from './notify';

export const WAKE_NOTICE_MS = 5000;
export const STARTING = 'Starting the server. On the free plan this can take up to a minute.';
export const READY = 'The server is ready.';

let asked = false;

export function wakeServer({ noticeAfter = WAKE_NOTICE_MS } = {}) {
  if (asked) return Promise.resolve();
  asked = true;
  let slow = false;
  const notice = setTimeout(() => {
    slow = true;
    toast(STARTING, 'info', { duration: 60000 });
  }, noticeAfter);
  return fetch(`${API_BASE}/health`)
    .then(resp => { if (slow && resp.ok) toast(READY, 'success'); })
    .catch(() => { /* offline: each request reports its own failure */ })
    .finally(() => clearTimeout(notice));
}

/* For tests: ask again on the next call. */
export function resetWake() {
  asked = false;
}
