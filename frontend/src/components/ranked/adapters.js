/* Adapters — normalise the ranked-candidate payloads into one row shape.
 *
 * Two endpoints return ranked candidates in different shapes:
 *
 *   POST /api/pipeline/run          ats_score, verdict, matched_skills,
 *                                   skills_match, predicted_role, ...
 *   POST /api/chat/automate-ranking score, rank, verdict, standout,
 *                                   strengths, gaps, interview_priority
 *
 * Keeping the difference here means RankedCandidates renders one shape and the
 * call sites stay thin. It also makes the mismatch visible rather than buried
 * in JSX: `score` vs `ats_score` and `rank` vs sort order were the sort of
 * divergence that quietly produced two different UIs for one concept.
 */

export const VERDICTS = ['Strong Fit', 'Good Fit', 'Consider', 'No Match'];

/* Mirrors ats_service.py's thresholds. Exported so the UI can derive a verdict
 * when a payload omits one, instead of inventing a label. */
export function verdictForScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return '';
  if (n >= 75) return 'Strong Fit';
  if (n >= 55) return 'Good Fit';
  if (n >= 35) return 'Consider';
  return 'No Match';
}

export function toneForVerdict(verdict) {
  switch (verdict) {
    case 'Strong Fit': return 'positive';
    case 'Good Fit': return 'accent';
    case 'Consider': return 'caution';
    case 'No Match': return 'neutral';
    default: return 'neutral';
  }
}

/* The LLM ranker returns fuzzy verdict strings ("Strong candidate", "Potential
 * fit") rather than the four exact labels. Snap them so one vocabulary reaches
 * the UI. */
export function normalizeVerdict(raw, score) {
  const v = String(raw || '').toLowerCase();
  if (v.includes('strong')) return 'Strong Fit';
  if (v.includes('good')) return 'Good Fit';
  if (v.includes('potential') || v.includes('consider') || v.includes('maybe')) return 'Consider';
  if (v.includes('no match') || v.includes('reject') || v.includes('poor')) return 'No Match';
  return verdictForScore(score);
}

function metaLine(parts) {
  return parts.filter(Boolean).join(' · ');
}

/** POST /api/pipeline/run -> row */
export function fromAtsResult(r) {
  const score = Number(r.ats_score) || 0;
  return {
    id: r.candidate_id,
    name: r.name || 'Unknown',
    email: r.email || '',
    score,
    verdict: r.verdict || verdictForScore(score),
    meta: metaLine([
      r.predicted_role,
      r.total_experience_years ? `${r.total_experience_years}y exp` : '',
      r.location,
    ]),
    matchLabel: 'skills',
    matchValue: Number(r.skills_match) || 0,
    matched: r.matched_skills || [],
    missing: r.missing_skills || [],
    bars: [
      { label: 'Skills match', value: Number(r.skills_match) || 0 },
      { label: 'Experience', value: Number(r.experience_match) || 0 },
      { label: 'Role relevance', value: Number(r.role_match) || 0 },
      { label: 'Education', value: Number(r.education_match) || 0 },
    ],
    note: r.summary || '',
    rejected: Boolean(r.auto_reject),
    rejectionReason: r.rejection_reason || '',
  };
}

/** POST /api/chat/automate-ranking -> row */
export function fromRankingRow(r) {
  const score = Number(r.score) || 0;
  return {
    id: r.candidate_id ?? r.name,
    name: r.name || 'Unknown',
    email: r.email || '',
    score,
    verdict: normalizeVerdict(r.verdict, score),
    meta: metaLine([r.predicted_role, r.interview_priority ? `${r.interview_priority} priority` : '']),
    matchLabel: 'fit',
    matchValue: score,
    matched: r.strengths || [],
    missing: r.gaps || [],
    bars: [],
    note: r.standout || '',
    rejected: false,
    rejectionReason: '',
  };
}
