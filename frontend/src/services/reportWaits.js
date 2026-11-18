// How long to wait between asks for an interview's report, which the server
// writes in the background once the interview ends: often within seconds,
// minutes when the AI is busy and it's tried again. Every 4 seconds for two
// minutes, then every 15, up to ten in all. The candidate's page asks on it,
// and the manager's (hooks/useReportWatch.js).
export const REPORT_WAITS = [...Array(30).fill(4000), ...Array(32).fill(15000)];

// No waits: ask once.
export const ASK_ONCE = [];
