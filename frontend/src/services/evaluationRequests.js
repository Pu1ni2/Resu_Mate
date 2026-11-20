import { API_BASE, authFetch } from './authFetch';

/* Each evaluation is written in the background (the server's evaluation.write
 * job): asking for one answers at once with the request, and its page asks
 * after it until the evaluation is written, or couldn't be. It was written
 * inside the request, and lost when the page closed. */

// Every 3 seconds for two minutes, then every 15 for ten more: an evaluation
// takes a minute or so, or longer when the AI is busy and it's tried again.
export const EVALUATION_WAITS = [...Array(40).fill(3000), ...Array(40).fill(15000)];

// Still being written.
export const writing = request => request?.status === 'pending';

// Ask after this request after each of `waits`, calling onUpdate with each
// answer, until it's no longer being written; onOutOfWaits when the last
// wait passes first. One gone meanwhile (its candidate deleted) is asked
// after no more. Returns what stops it, for when the page closes.
export function followEvaluation(requestId, onUpdate, waits = EVALUATION_WAITS, onOutOfWaits = () => {}) {
  let stopped = false;
  let timer;
  const ask = async (i) => {
    if (stopped) return;  // a wait that ran out as the page closed
    try {
      const response = await authFetch(`${API_BASE}/api/chat/evaluations/${encodeURIComponent(requestId)}`);
      if (stopped) return;
      if (response.status === 404) return;
      if (response.ok) {
        const request = await response.json();
        if (stopped) return;
        onUpdate(request);
        if (!writing(request)) return;
      }
    } catch { /* out of reach for a moment: asked again */ }
    if (stopped) return;
    if (i + 1 < waits.length) timer = setTimeout(() => ask(i + 1), waits[i + 1]);
    else onOutOfWaits();
  };
  if (waits.length) timer = setTimeout(() => ask(0), waits[0]);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

// The request once it's no longer being written, for the assistant, which
// then says how it went; or as it last stood, when the waits run out first or
// `signal` says the assistant has closed.
export function evaluationWritten(asked, { signal, waits = EVALUATION_WAITS } = {}) {
  if (!writing(asked) || signal?.aborted) return Promise.resolve(asked);
  return new Promise((resolve) => {
    let last = asked;
    const stop = followEvaluation(asked.request_id, (request) => {
      last = request;
      if (!writing(request)) resolve(request);
    }, waits, () => resolve(last));
    signal?.addEventListener('abort', () => {
      stop();
      resolve(last);
    }, { once: true });
  });
}
