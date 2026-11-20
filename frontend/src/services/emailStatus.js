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
// answer ({ id: email }), until none is still to go; onOutOfWaits when the
// last wait passes first. Returns what stops it, for when the page closes.
export function followEmails(ids, onUpdate, waits = EMAIL_WAITS, onOutOfWaits = () => {}) {
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
    if (stopped) return;
    if (i + 1 < waits.length) timer = setTimeout(() => ask(i + 1), waits[i + 1]);
    else onOutOfWaits();
  };
  if (ids.length && waits.length) timer = setTimeout(() => ask(0), waits[0]);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

// The emails once none is still to go ({ id: email }), for the assistant,
// which then says how they went; or as they last stood, when the waits run
// out first or `signal` says the assistant has closed.
export function emailsEnded(ids, { signal, waits = EMAIL_WAITS } = {}) {
  if (!ids.length || signal?.aborted) return Promise.resolve({});
  return new Promise((resolve) => {
    let last = {};
    const stop = followEmails(ids, (emails) => {
      last = emails;
      if (!Object.values(emails).some(pending)) resolve(emails);
    }, waits, () => resolve(last));
    signal?.addEventListener('abort', () => {
      stop();
      resolve(last);
    }, { once: true });
  });
}
