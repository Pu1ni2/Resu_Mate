/* Years of experience, when the résumé gives them: a number, or null when
 * they aren't known. Unknown was shown, sorted and told to Jarvis as 0, so a
 * résumé the analysis couldn't read had "0y". The server keeps it unknown
 * too (backend/app/services/experience.py). */
export const knownYears = value => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
);
