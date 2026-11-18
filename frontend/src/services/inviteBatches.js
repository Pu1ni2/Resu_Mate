import { API_BASE, authFetch } from './authFetch';

/* Batch invitations. POST /api/pipeline/batches answers at once, and a
 * background job makes each candidate's interview, questions, draft and
 * email; GET /api/pipeline/batches/{id} says how far each one got. The batch
 * dialog follows it (components/pipeline/BatchActionConfirm.jsx).
 *
 * The batch was made inside one request: five people took minutes, the
 * browser gave up after two, and asking again made every interview again. */

// Between asks: every 2 seconds for the first minute, then every 5, for 40
// minutes in all. Two candidates are prepared at a time, each in a minute or
// less, so a batch of a hundred takes a while.
export const BATCH_WAITS = [...Array(30).fill(2000), ...Array(468).fill(5000)];

// A dialog's own key, one per dialog: asking again with it, after an answer
// that didn't arrive say, is the same batch, so no one is invited twice.
export function newClientKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

async function answer(response, failed) {
  if (response.ok) return response.json();
  let detail = '';
  try {
    detail = (await response.json()).detail;
  } catch { /* no body */ }
  throw new Error(typeof detail === 'string' && detail ? detail : failed);
}

// Start a batch; the batch as it stands, each candidate queued or skipped.
export async function startBatch(body) {
  const response = await authFetch(`${API_BASE}/api/pipeline/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return answer(response, 'The invitations couldn’t be started.');
}

// Ask after a batch after each of `waits`, calling onProgress with each
// answer, until every candidate's invitation has finished. Returns what
// stops it, for when the page closes.
export function followBatch(batchId, onProgress, waits = BATCH_WAITS) {
  let stopped = false;
  let timer;
  const ask = async (i) => {
    if (stopped) return;  // a wait that ran out as the page closed
    try {
      const batch = await answer(await authFetch(`${API_BASE}/api/pipeline/batches/${batchId}`), '');
      if (stopped) return;
      onProgress(batch);
      if (batch.finished) return;
    } catch { /* out of reach for a moment: asked again */ }
    if (!stopped && i + 1 < waits.length) timer = setTimeout(() => ask(i + 1), waits[i + 1]);
  };
  if (waits.length) timer = setTimeout(() => ask(0), waits[0]);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
