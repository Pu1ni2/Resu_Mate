import { API_BASE, authFetch } from './authFetch';

/* A single interview's questions are written in the background (the server's
 * interview.questions job): the interview is made at once, its questions
 * "pending", and its invitation held until they're written. Its page asks
 * after it until they are. */

// Every 3 seconds for a minute, then every 15 for five more: questions take
// seconds, or a minute or two when the AI is busy and they're tried again.
export const QUESTION_WAITS = [...Array(20).fill(3000), ...Array(20).fill(15000)];

// Still being written.
export const writing = interview => interview.questions_status === 'pending';

// Ask after this interview after each of `waits`, calling onWritten with it
// once its questions are no longer being written. One deleted meanwhile is
// asked after no more. Returns what stops it, for when the page closes.
export function followQuestions(interviewId, onWritten, waits = QUESTION_WAITS) {
  let stopped = false;
  let timer;
  const ask = async (i) => {
    try {
      const response = await authFetch(`${API_BASE}/api/chat/interviews/${interviewId}`);
      if (response.status === 404) return;
      if (response.ok) {
        const interview = await response.json();
        if (stopped) return;  // closed while it was asked
        if (!writing(interview)) {
          onWritten(interview);
          return;
        }
      }
    } catch { /* out of reach for a moment: asked again */ }
    if (!stopped && i + 1 < waits.length) timer = setTimeout(() => ask(i + 1), waits[i + 1]);
  };
  timer = setTimeout(() => ask(0), waits[0]);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
