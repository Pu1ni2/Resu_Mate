/* Interview scores as the server sends them: a number, or null for an answer
 * or an analysis that couldn't be scored. They used to be made up (5/10,
 * 50/100) when the AI step failed, and averages counted a missing score as 0. */

export const isScore = (value) => typeof value === 'number' && Number.isFinite(value);

/* One answer's score, from { score } or a bare number; null when unscored. */
export function scoreOf(entry) {
  const value = entry && typeof entry === 'object' ? entry.score : entry;
  return isScore(value) ? value : null;
}

/* The average of the scored answers, to one decimal, or null if none was. */
export function averageScore(scores) {
  const numbers = (scores || []).map(scoreOf).filter(isScore);
  if (numbers.length === 0) return null;
  return Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 10) / 10;
}

/* A score for display: the number, or the dash that means "not scored". */
export const shownScore = (value) => (isScore(value) ? value : '—');
