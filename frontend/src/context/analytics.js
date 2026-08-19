/* Pool analytics for the selected candidates.
 *
 * Lifted out of a useMemo in AppContext so it can be tested directly. It was
 * tested by a copy of the arithmetic living in the test file, which is how the
 * bug below survived: the copy returned topSkillsAllEqual and the real one
 * forgot to, and no test could tell.
 */

/* Skill counts, and the two different numbers that were previously conflated:
 *
 *   share   what fraction of the selected candidates have this skill. The real
 *           statistic, but useless as a bar length — with one candidate
 *           selected every skill they have is 1/1, so every bar rendered at
 *           100% and the chart said nothing at all.
 *   barPct  the count relative to the most common skill. This is what a bar
 *           length should encode: magnitude within the series.
 *
 * allEqual is surfaced so the view can decide a bar chart is the wrong form.
 * Bars of identical length are not a chart, and that is what an evenly
 * distributed pool produces.
 */
export function computeSkillStats(selected) {
  const total = selected.length;
  const skillMap = new Map();
  selected.forEach(c => {
    (c.skills || []).forEach(skill => {
      // Skills arrive either as strings or as { name, ... } depending on which
      // parser version wrote the record.
      const name = typeof skill === 'string' ? skill : skill?.name;
      if (name) skillMap.set(name, (skillMap.get(name) || 0) + 1);
    });
  });

  const counts = Array.from(skillMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = counts.length ? counts[0][1] : 0;

  return {
    totalSkills: skillMap.size,
    topSkills: counts.map(([name, count]) => ({
      name,
      count,
      share: total ? Math.round((count / total) * 100) : 0,
      barPct: max ? Math.round((count / max) * 100) : 0,
    })),
    topSkillsAllEqual: counts.length > 1 && counts.every(([, c]) => c === max),
  };
}

function distribution(selected, pick, fallback) {
  const map = new Map();
  selected.forEach(c => {
    const key = pick(c) || fallback;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export const EMPTY_ANALYTICS = {
  total: 0,
  avgExperience: 0,
  totalSkills: 0,
  topSkills: [],
  topSkillsAllEqual: false,
  roleDistribution: [],
  levelDistribution: [],
};

export function computeAnalytics(candidates) {
  // Non-resume uploads (job descriptions, mostly) are in the same list but are
  // not people, so they do not belong in a candidate pool's statistics.
  const selected = (candidates || []).filter(c => c.is_resume !== false);
  if (selected.length === 0) return EMPTY_ANALYTICS;

  const total = selected.length;
  const skills = computeSkillStats(selected);

  return {
    total,
    avgExperience: (
      selected.reduce((s, c) => s + (c.total_experience_years || 0), 0) / total
    ).toFixed(1),
    ...skills,
    roleDistribution: distribution(selected, c => c.predicted_role, 'Unknown'),
    levelDistribution: distribution(selected, c => c.experience_level, 'Entry'),
  };
}
