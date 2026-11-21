import { API_BASE, authFetch } from './authFetch';

/* Find Candidates' searches run on the server, in the background (its
 * sourcing.search job), which writes each one as it goes: leaving the page
 * doesn't stop one. The page starts a search, then follows it by its id,
 * asking what it wrote since the last write the page saw
 * (GET /api/sourcer/runs/{id}/progress?after=), and turns each answer into
 * the events the talent map is built from (talentMapModel.js). A search
 * ran inside one request, streamed, and stopped when the page closed. */

// Start a search: the server queues it, and answers with its id for the
// page to follow. Rejects with what to tell the manager when it can't
// start: one already running, say, or the hour's searches used.
export async function startRun(body) {
  let response;
  try {
    response = await authFetch(`${API_BASE}/api/sourcer/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error('Could not reach the server. Please check your connection.', { cause: err });
  }
  if (response.status === 429) throw new Error('Too many searches this hour. Please wait and try again.');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === 'string' && data.detail ? data.detail : 'The search could not start.');
  return data.run_id;
}

// Every second and a half, for as long as a search can run (half an hour)
// and a little more.
export const RUN_WAITS = Array(1400).fill(1500);

// Still to end: waiting to run, running, or asked to stop.
export const active = run => ['queued', 'running', 'stopping'].includes(run?.status);

// The talent map's events for one answer: the plan; each person, found, then
// judged once they are; the ids to act on them by; the stats and warnings;
// and, once the search has ended, how. The map takes each person and each
// warning once, however often they come. Someone found and judged between
// two answers comes as both, found first: found already judged, the map would
// take the judgement as one it had, and never count it.
export function progressEvents({ run, profiles }) {
  const events = [];
  if (run.plan.criteria) events.push({ type: 'plan', plan: run.plan });
  const ids = {};
  for (const { id, ...person } of profiles) {
    ids[person.pid] = id;
    events.push({ type: 'found', person: { ...person, verdict: null } });
    if (person.verdict) events.push({ type: 'judged', ...person });
  }
  events.push({ type: 'saved', run_id: run.id, profile_ids: ids });
  events.push({ type: 'stats', ...run.stats });
  for (const message of run.warnings || []) events.push({ type: 'warning', message });
  if (run.status === 'failed') events.push({ type: 'error', message: run.error });
  if (run.status === 'complete' || run.status === 'failed') events.push({ type: 'done', stats: run.stats });
  return events;
}

// Ask after this search after each of `waits`, from its write `after` (0:
// from the start), calling onProgress with each answer, until it has ended.
// One deleted meanwhile is asked after no more. Returns what stops it, for
// when the page closes.
export function followRun(runId, onProgress, after, waits = RUN_WAITS) {
  let stopped = false;
  let timer;
  let seen = after;
  const ask = async (i) => {
    try {
      const response = await authFetch(`${API_BASE}/api/sourcer/runs/${runId}/progress?after=${seen}`);
      if (response.status === 404) return;
      const progress = await response.json();
      if (stopped) return;  // closed while it was asked
      seen = progress.run.seq; // a server error's answer has no run: asked again
      onProgress(progress);
      if (!active(progress.run)) return;
    } catch { /* out of reach for a moment, or a server error: asked again */ }
    if (!stopped && i + 1 < waits.length) timer = setTimeout(() => ask(i + 1), waits[i + 1]);
  };
  timer = setTimeout(() => ask(0), waits[0]);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
