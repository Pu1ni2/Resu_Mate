/* Number formats for the talent map. Figures are shown in mono, so these only
 * decide the text. */

export function formatCount(n) {
  return Number(n || 0).toLocaleString('en-US');
}

/* 203 -> "3:23" */
export function formatElapsed(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* Dollars when prices are configured, otherwise tokens: a made-up price would
 * be worse than no price. */
export function formatCost(costUsd, tokens) {
  if (costUsd != null) return `$${costUsd < 0.01 && costUsd > 0 ? costUsd.toFixed(4) : costUsd.toFixed(2)}`;
  const t = Number(tokens || 0);
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M tokens`;
  if (t >= 1_000) return `${(t / 1_000).toFixed(1)}k tokens`;
  return `${t} tokens`;
}
