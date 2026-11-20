import { API_BASE, authFetch } from './authFetch';

/* Emails go through an outbox: a request that sends one answers with its id,
 * and a background job sends it, trying again while the email service is
 * busy. GET /api/emails?ids= says how each went: queued, sent, failed (with
 * why), skipped or cancelled. A page that said "Emailed" as soon as it asked
 * would be guessing. */

// Every 2 seconds for half a minute, then every 10 for five more: an email
// goes in seconds, or minutes when the service is busy and it's tried again.
export const EMAIL_WAITS = [...Array(15).fill(2000), ...Array(30).fill(10000)];

// Still to go: anything else has ended, one way or another.
export const pending = email => email?.status === 'queued' || email?.status === 'held';

// Ask after these emails after each of `waits`, calling onUpdate with each
// answer ({ id: email }), until none is still to go. Returns what stops it,
// for when the page closes.
export function followEmails(ids, onUpdate, waits = EMAIL_WAITS) {
  let stopped = false;
  let timer;
  const ask = async (i) => {
    if (stopped) return;  // a wait that ran out as the page closed
    try {
      const response = await authFetch(`${API_BASE}/api/emails?ids=${ids.join(',')}`);
      if (response.ok) {
        const { emails } = await response.json();
        if (stopped) return;
        onUpdate(Object.fromEntries(emails.map(email => [email.id, email])));
        if (!emails.some(pending)) return;
      }
    } catch { /* out of reach for a moment: asked again */ }
    if (!stopped && i + 1 < waits.length) timer = setTimeout(() => ask(i + 1), waits[i + 1]);
  };
  if (ids.length && waits.length) timer = setTimeout(() => ask(0), waits[0]);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
