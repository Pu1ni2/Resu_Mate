/* Live sourcing runs, read as they stream.
 *
 * POST /api/sourcer/runs answers with NDJSON: one JSON event per line, written
 * as the run happens. EventSource cannot send the Authorization header, so the
 * body is read with fetch and a stream reader instead.
 */
import { API_BASE, authFetch } from './authFetch';

/* Split a growing text buffer into complete lines. Returns [lines, rest], where
 * rest is a partial line still waiting for its newline. Blank lines are dropped. */
export function splitLines(buffer) {
  const lines = buffer.split('\n');
  const rest = lines.pop();
  return [lines.filter(line => line.trim()), rest];
}

function emit(line, onEvent) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return; // a line that isn't JSON is skipped, never fatal to the run
  }
  onEvent(event);
}

async function messageFor(resp) {
  if (resp.status === 429) return 'Too many searches this hour. Please wait and try again.';
  try {
    const data = await resp.json();
    if (typeof data?.detail === 'string' && data.detail) return data.detail;
  } catch {
    /* no JSON body */
  }
  return 'The search could not start.';
}

/* Start a run and call onEvent(event) for every event, in order.
 *
 * Resolves with { stopped: false } when the run ends. Aborting `signal` cancels
 * the request, which the server takes as Stop and saves what it has judged; that
 * resolves with { stopped: true }. A request that fails rejects with an Error
 * whose message can be shown as it is.
 */
export async function streamRun(body, onEvent, signal) {
  let resp;
  try {
    resp = await authFetch(`${API_BASE}/api/sourcer/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') return { stopped: true };
    throw new Error('Could not reach the server. Please check your connection.', { cause: err });
  }
  if (!resp.ok) throw new Error(await messageFor(resp));

  const reader = resp.body.getReader();
  // stream: true keeps a character whose bytes are split across two chunks
  // from being decoded as two broken halves.
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const [lines, rest] = splitLines(buffer);
      buffer = rest;
      for (const line of lines) emit(line, onEvent);
    }
    buffer += decoder.decode();
    if (buffer.trim()) emit(buffer, onEvent);
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) return { stopped: true };
    throw new Error('The connection dropped during the search.', { cause: err });
  }
  return { stopped: false };
}
