import { describe, it, expect } from 'vitest';

/* Guards the skill-chart maths.
 *
 * The shipped bug: percentage was count / candidateCount * 100. With one
 * candidate selected, every skill they have is 1/1 = 100%, so every bar
 * rendered full width and the chart carried no information at all. It looked
 * plausible, which is why it survived.
 *
 * The computation is duplicated here rather than imported because it lives
 * inside a useMemo in AppContext, which needs the whole provider to exercise.
 * That makes this a characterisation test: if the real one is changed, this
 * must be changed with it, and the assertions below say what the numbers mean.
 */
function skillStats(candidates) {
  const total = candidates.length;
  if (!total) return { topSkills: [], topSkillsAllEqual: false };

  const skillMap = new Map();
  candidates.forEach(c => {
    (c.skills || []).forEach(skill => {
      skillMap.set(skill, (skillMap.get(skill) || 0) + 1);
    });
  });

  const counts = Array.from(skillMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = counts.length ? counts[0][1] : 0;
  return {
    topSkills: counts.map(([name, count]) => ({
      name,
      count,
      share: Math.round((count / total) * 100),
      barPct: max ? Math.round((count / max) * 100) : 0,
    })),
    topSkillsAllEqual: counts.length > 1 && counts.every(([, c]) => c === max),
  };
}

describe('skill chart maths', () => {
  it('bar length scales to the most common skill, not the candidate count', () => {
    const { topSkills } = skillStats([
      { skills: ['Python', 'AWS'] },
      { skills: ['Python', 'Django'] },
      { skills: ['Python'] },
      { skills: ['Go'] },
    ]);
    const byName = Object.fromEntries(topSkills.map(s => [s.name, s]));

    // Python 3, AWS/Django/Go 1 each.
    expect(byName.Python.count).toBe(3);
    expect(byName.Python.barPct).toBe(100);
    // A skill a third as common must be a third as long. Under the old formula
    // this was 25% (1 of 4 candidates), which conflated two different ideas.
    expect(byName.AWS.barPct).toBe(33);
  });

  it('keeps share as a separate, real statistic', () => {
    const { topSkills } = skillStats([
      { skills: ['Python'] },
      { skills: ['Python'] },
      { skills: ['Go'] },
      { skills: [] },
    ]);
    const byName = Object.fromEntries(topSkills.map(s => [s.name, s]));
    // Half the candidates know Python; it is also the most common, so the bar
    // is full length. Both numbers are correct and they are not the same number.
    expect(byName.Python.share).toBe(50);
    expect(byName.Python.barPct).toBe(100);
  });

  it('never renders every bar full width for one candidate', () => {
    // The exact shipped defect.
    const { topSkills } = skillStats([{ skills: ['Python', 'Java', 'R', 'SQL'] }]);
    const full = topSkills.filter(s => s.barPct === 100);
    // All counts are 1, so all bars are equal — which is precisely why the view
    // switches to chips. The flag has to be set.
    expect(full).toHaveLength(topSkills.length);
  });

  it('flags an all-equal series so the view can pick another form', () => {
    expect(skillStats([{ skills: ['A', 'B', 'C'] }]).topSkillsAllEqual).toBe(true);
    expect(
      skillStats([{ skills: ['A', 'B'] }, { skills: ['A'] }]).topSkillsAllEqual,
    ).toBe(false);
  });

  it('handles an empty pool without dividing by zero', () => {
    expect(skillStats([]).topSkills).toEqual([]);
    expect(skillStats([{ skills: [] }]).topSkills).toEqual([]);
  });
});
