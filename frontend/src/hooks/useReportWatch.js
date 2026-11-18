import { useEffect } from 'react';

import { API_BASE, authFetch } from '../services/authFetch';
import { REPORT_WAITS } from '../services/reportWaits';

/* While the server's background job writes one of the manager's interview
 * reports (report_status "pending"), ask for the interview
 * (GET /api/chat/interviews/{id}) after each of REPORT_WAITS, until its report
 * is done or failed; then onSettled(interview), with what the server answered.
 * Stops when the page closes, or the interview changes. */
export default function useReportWatch(interviewId, pending, onSettled) {
  useEffect(() => {
    if (!interviewId || !pending) return undefined;
    let stopped = false;
    let timer;
    const ask = async (i) => {
      if (stopped) return;  // a wait that ran out as the page closed
      try {
        const response = await authFetch(`${API_BASE}/api/chat/interviews/${interviewId}`);
        if (response.ok) {
          const interview = await response.json();
          if (stopped) return;
          if (interview.report_status !== 'pending') {
            onSettled(interview);
            return;
          }
        }
      } catch { /* out of reach for a moment: asked again */ }
      if (!stopped && i + 1 < REPORT_WAITS.length) timer = setTimeout(() => ask(i + 1), REPORT_WAITS[i + 1]);
    };
    timer = setTimeout(() => ask(0), REPORT_WAITS[0]);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // onSettled is the page's own, made anew each render; the watch follows
    // the interview and whether its report is pending.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId, pending]);
}
