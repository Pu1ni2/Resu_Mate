import { describe, it, expect } from 'vitest';

import { computeAnalytics, computeSkillStats, EMPTY_ANALYTICS } from './analytics';

/* Guards the skill-chart maths.
 *
 * The shipped bug: percentage was count / candidateCount * 100. With one
 * candidate selected, every skill they have is 1/1 = 100%, so every bar
 * rendered full width and the chart carried no information at all. It looked
 * plausible, which is why it survived.
 *
 * This file used to hold a copy of the arithmetic instead of importing it,
 * because the real version lived inside a useMemo. That copy is what let the
 * second bug through — see 'returns every field the view reads' below.
 */

describe('skill chart maths', () => {
  it('bar length scales to the most common skill, not the candidate count', () => {
    const { topSkills } = computeSkillStats([
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
    const { topSkills } = computeSkillStats([
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
    const { topSkills, topSkillsAllEqual } = computeSkillStats([
      { skills: ['Python', 'Java', 'R', 'SQL'] },
    ]);
    // All counts are 1, so all bars are equal — which is precisely why the view
    // switches to chips. The flag has to be set.
    expect(topSkills.filter(s => s.barPct === 100)).toHaveLength(topSkills.length);
    expect(topSkillsAllEqual).toBe(true);
  });

  it('flags an all-equal series so the view can pick another form', () => {
    expect(computeSkillStats([{ skills: ['A', 'B', 'C'] }]).topSkillsAllEqual).toBe(true);
    expect(
      computeSkillStats([{ skills: ['A', 'B'] }, { skills: ['A'] }]).topSkillsAllEqual,
    ).toBe(false);
  });

  it('handles an empty pool without dividing by zero', () => {
    expect(computeSkillStats([]).topSkills).toEqual([]);
    expect(computeSkillStats([{ skills: [] }]).topSkills).toEqual([]);
  });

  it('reads skills whether they are strings or objects', () => {
    // Records written by different parser versions carry both shapes.
    const { topSkills } = computeSkillStats([
      { skills: ['Python'] },
      { skills: [{ name: 'Python' }] },
      { skills: [{ nome: 'typo' }, null] },
    ]);
    expect(topSkills[0]).toMatchObject({ name: 'Python', count: 2 });
    expect(topSkills).toHaveLength(1);
  });

  it('caps the series at ten', () => {
    const many = { skills: Array.from({ length: 25 }, (_, i) => `skill-${i}`) };
    expect(computeSkillStats([many]).topSkills).toHaveLength(10);
    // totalSkills still reports the true count — it is a stat tile, not a series.
    expect(computeSkillStats([many]).totalSkills).toBe(25);
  });
});

describe('computeAnalytics', () => {
  const pool = [
    { skills: ['Python'], total_experience_years: 4, predicted_role: 'Backend', experience_level: 'Mid' },
    { skills: ['Python', 'Go'], total_experience_years: 6, predicted_role: 'Backend', experience_level: 'Senior' },
    { skills: ['React'], total_experience_years: 2, predicted_role: 'Frontend', experience_level: 'Junior' },
  ];

  it('returns every field the view reads', () => {
    // The second bug, and the reason this file no longer duplicates the maths:
    // the real memo computed topSkillsAllEqual and then left it out of its
    // return object, so Dashboard read undefined and the chip fallback only
    // ever fired through its `total < 2` clause. A test that reimplemented the
    // function could not see that — this one compares against the empty-state
    // shape, which is the contract the view is written to.
    const keys = Object.keys(computeAnalytics(pool)).sort();
    expect(keys).toEqual(Object.keys(EMPTY_ANALYTICS).sort());
  });

  it('averages experience across the pool', () => {
    expect(computeAnalytics(pool).avgExperience).toBe('4.0');
    expect(computeAnalytics([{ skills: [] }]).avgExperience).toBe('0.0');
  });

  it('ranks roles and levels by frequency', () => {
    const a = computeAnalytics(pool);
    expect(a.roleDistribution[0]).toEqual({ name: 'Backend', count: 2 });
    expect(a.levelDistribution.map(l => l.count)).toEqual([1, 1, 1]);
  });

  it('labels missing role and level rather than dropping the candidate', () => {
    const a = computeAnalytics([{ skills: ['X'] }]);
    expect(a.roleDistribution).toEqual([{ name: 'Unknown', count: 1 }]);
    expect(a.levelDistribution).toEqual([{ name: 'Entry', count: 1 }]);
    expect(a.total).toBe(1);
  });

  it('excludes uploads that are not resumes', () => {
    // Job descriptions live in the same list and are not people.
    const a = computeAnalytics([...pool, { is_resume: false, skills: ['Nonsense'] }]);
    expect(a.total).toBe(3);
    expect(a.topSkills.some(s => s.name === 'Nonsense')).toBe(false);
  });

  it('returns the empty shape for an empty or missing pool', () => {
    expect(computeAnalytics([])).toEqual(EMPTY_ANALYTICS);
    expect(computeAnalytics(undefined)).toEqual(EMPTY_ANALYTICS);
    expect(computeAnalytics([{ is_resume: false }])).toEqual(EMPTY_ANALYTICS);
  });
});
