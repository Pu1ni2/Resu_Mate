import { candidatesAPI } from './api';

/* An uploaded résumé is read by the AI in the background (the server's
 * resume.analyze job): the candidate is "pending" until it has been, then
 * done, or failed. A page that showed the upload's answer alone would say
 * "Reading the résumé…" for good. */

// Every 3 seconds for a minute, then every 15 for ten more: a reading takes
// seconds, or minutes when the AI is busy and it's tried again.
export const READING_WAITS = [...Array(20).fill(3000), ...Array(40).fill(15000)];

// Still being read.
export const reading = candidate => candidate?.analysis_status === 'pending';

// Ask after these candidates after each of `waits`, calling onRead with each
// one once it's no longer being read, until none is. One deleted meanwhile
// is asked after no more. Returns what stops it, for when the page closes.
export function followReadings(ids, onRead, waits = READING_WAITS) {
  let stopped = false;
  let timer;
  let left = [...ids];
  const ask = async (i) => {
    if (stopped) return;  // a wait that ran out as the page closed
    const answers = await Promise.all(left.map(async (id) => {
      try {
        return { id, candidate: (await candidatesAPI.getOne(id)).data };
      } catch (err) {
        // Gone, or out of reach for a moment: asked again.
        return { id, gone: err?.response?.status === 404 };
      }
    }));
    if (stopped) return;
    answers.forEach(({ candidate }) => { if (candidate && !reading(candidate)) onRead(candidate); });
    left = answers.filter(({ candidate, gone }) => (candidate ? reading(candidate) : !gone)).map(({ id }) => id);
    if (left.length && i + 1 < waits.length) timer = setTimeout(() => ask(i + 1), waits[i + 1]);
  };
  if (left.length && waits.length) timer = setTimeout(() => ask(0), waits[0]);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
