/* Why an interview couldn't start, in words for the candidate, by the step it
 * failed at. The rooms showed the browser's, LiveKit's or OpenAI's own text
 * ("Session mint failed (502): {"detail": …}"), with hints about "OpenAI
 * Realtime" and "LiveKit credentials". A refusal from our own server keeps its
 * reason, such as an interview that is already complete: it is written for
 * them. The browser's console keeps the details. */

const AGAIN = 'Check your connection and try again.';

const WORDS = {
  micBlocked: ['Your microphone is blocked for this site.', 'Allow microphone access in your browser settings, then try again.'],
  micUnavailable: ['No microphone could be used.', 'Check that one is connected and not in use by another app, then try again.'],
  cameraBlocked: ['Your camera or microphone is blocked for this site.', 'Allow both in your browser settings, then try again.'],
  cameraUnavailable: ['Your camera or microphone couldn’t be used.', 'Check that they’re connected and not in use by another app, then try again.'],
  unreachable: ['Couldn’t reach the interview server.', AGAIN],
  connect: ['Couldn’t connect to the interviewer.', AGAIN],
  notReady: ['The video interview isn’t available right now.', 'Contact your hiring manager.'],
  unexpected: ['The interview couldn’t be started.', 'Try again in a moment, or contact your hiring manager if it keeps happening.'],
};

/* A failure at `step`; `reason` is the server's words for a refusal. */
export function startFailed(step, reason = '') {
  return Object.assign(new Error(reason || step), { step });
}

/* A device that couldn't be had: blocked, or otherwise unavailable. */
export const deviceStep = (error, blocked, unavailable) => (
  error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError' ? blocked : unavailable
);

/* Runs `request`, a failure to reach anyone counting as `step`. */
export async function reaching(step, request) {
  try {
    return await request();
  } catch (error) {
    throw startFailed(step, error?.message);
  }
}

/* What the room shows for a failure: { message, hint }. */
export function shownFailure(error) {
  if (error?.step === 'refused') {
    return { message: error.message, hint: 'If it keeps happening, contact your hiring manager.' };
  }
  const [message, hint] = WORDS[error?.step] || WORDS.unexpected;
  return { message, hint };
}
