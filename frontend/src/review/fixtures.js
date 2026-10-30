/* Sample data for the design review page (review.jsx), shaped like what the
 * backend sends, so each page is judged with what a user really sees: the
 * candidate list, a screening run, a finished voice interview, the interview
 * statuses, and a candidate's session after signing in. The people and the
 * numbers are made up. */

export const candidates = [
  {
    id: 101,
    name: 'Maya Chen',
    email: 'maya@example.com',
    predicted_role: 'Senior Product Designer',
    total_experience_years: 7,
    experience_level: 'Senior',
    location: 'Brooklyn, NY',
    skills: ['Product design', 'Figma', 'User research', 'Design systems'],
    summary: 'A product designer who turns complex problems into considered, approachable experiences. Seven years working with cross-functional teams on products people use every day.',
    key_strengths: ['Connects research to clear product decisions', 'Builds thoughtful design systems', 'Partners closely with engineering'],
    education: [{ degree: 'BFA, Communication Design', institution: 'Example School of Design', year: '2017' }],
    work_experience: [{
      company: 'Fieldwork Studio',
      title: 'Senior Product Designer',
      duration: '2021 — Present',
      description: 'Led research and design for collaborative planning products. Built a shared component library with engineering.',
    }],
    raw_text: 'Maya Chen\nSenior Product Designer\nBrooklyn, NY\n\nEXPERIENCE\nFieldwork Studio · 2021–Present\nLed research and design for collaborative planning products. Built a shared component library with engineering.\n\nSKILLS\nProduct design, Figma, User research, Design systems\n\nEDUCATION\nBFA, Communication Design · 2017',
    is_resume: true,
    badges: [],
    embedded_links: {},
  },
  {
    id: 102,
    name: 'Alex Morgan',
    email: 'alex@example.com',
    predicted_role: 'Frontend Engineer',
    total_experience_years: 5,
    experience_level: 'Mid-level',
    location: 'Austin, TX',
    skills: ['React', 'TypeScript', 'Accessibility', 'CSS'],
    summary: 'Frontend engineer with a thoughtful approach to accessible interfaces and reusable components.',
    key_strengths: ['Accessible interface development', 'Design and engineering collaboration'],
    is_resume: true,
    embedded_links: {},
  },
  {
    id: 103,
    name: 'Jordan Ellis',
    email: 'jordan@example.com',
    predicted_role: 'Product Manager',
    total_experience_years: 6,
    experience_level: 'Senior',
    location: 'Boston, MA',
    skills: ['Product strategy', 'Analytics', 'User research', 'Roadmapping'],
    summary: 'Product manager connecting customer needs with measurable product outcomes.',
    is_resume: true,
    embedded_links: {},
  },
  {
    id: 104,
    name: 'Priya Shah',
    email: 'priya@example.com',
    predicted_role: 'Full Stack Engineer',
    total_experience_years: 4,
    experience_level: 'Mid-level',
    location: 'Seattle, WA',
    skills: ['Python', 'React', 'PostgreSQL', 'AWS'],
    summary: 'Engineer who enjoys building useful products from the first prototype through production.',
    is_resume: true,
    embedded_links: {},
  },
  {
    id: 105,
    name: 'Noah Williams',
    email: 'noah@example.com',
    predicted_role: 'UX Researcher',
    total_experience_years: 8,
    experience_level: 'Senior',
    location: 'Portland, OR',
    skills: ['User research', 'Interviews', 'Usability testing', 'Synthesis'],
    summary: 'Researcher helping teams understand the people their products serve.',
    is_resume: true,
    embedded_links: {},
  },
  {
    id: 106,
    name: 'Sofia Reyes',
    email: 'sofia@example.com',
    predicted_role: 'Visual Designer',
    total_experience_years: 3,
    experience_level: 'Mid-level',
    location: 'Chicago, IL',
    skills: ['Figma', 'Brand design', 'Motion', 'Typography'],
    summary: 'Visual designer with a love for expressive typography and clear communication.',
    is_resume: true,
    embedded_links: {},
  },
];

/* A finished voice interview, as the backend's candidate_report() sends it:
 * the report the interview worker writes from the transcript, in its four
 * sections, the transcript, and the length in seconds. Interviews aren't
 * scored per answer any more, so there are no scores and no average. */
export const report = {
  report: [
    '## Interview Summary',
    'Maya described how research reshaped a complex planning product, and tied her design choices to the needs of the people using it. She was open about trade-offs and about how she works with engineering.',
    '',
    '## Strengths',
    '- Explains her research process with concrete examples',
    '- Weighs speed against depth, and says why',
    '- Has built a shared design system with engineers',
    '',
    '## Concerns',
    '- Said less about measuring outcomes after launch',
    '- Few examples of leading work across several teams',
    '',
    '## Recommendation',
    'Hire',
  ].join('\n'),
  scores: [],
  avgScore: null,
  timer: 1080,
  duration: 1080,
  transcript: [
    { role: 'interviewer', text: 'Tell me about a design decision that changed after research.', timestamp: 1793109600 },
    { role: 'candidate', text: 'We started with a complex planning view. In interviews, we learned that the next step mattered more than a complete overview. We tested a simpler version and used the results to reshape the design.', timestamp: 1793109618 },
    { role: 'interviewer', text: 'How did you bring engineering along with that change?', timestamp: 1793109660 },
    { role: 'candidate', text: 'I shared the research clips early and paired with two engineers on the prototype, so the trade-offs were theirs as much as mine.', timestamp: 1793109675 },
  ],
  mode: 'conversational',
};

// Completed interviews, as get-all-interview-results lists them.
export const results = [{
  email: 'maya@example.com',
  candidate_id: 101,
  candidate_name: 'Maya Chen',
  timestamp: '2026-10-27T14:18:00',
  report,
  role: 'Senior Product Designer',
  scores: [],
}];

// The latest interview per address, as interview-statuses sends them.
export const statuses = {
  statuses: {
    'maya@example.com': { status: 'completed', mode: 'conversational', id: 41 },
    'alex@example.com': { status: 'in_progress', mode: 'conversational', id: 42 },
    'jordan@example.com': { status: 'pending', mode: 'avatar', id: 43 },
  },
  count: 3,
};

// A candidate's session, as the sign-in (verify-otp) leaves it.
export const session = {
  email: 'maya@example.com',
  name: 'Maya Chen',
  candidate_id: 101,
  has_interview: true,
  interview_completed: false,
  interview_report: null,
  interview_config: {
    role: 'Senior Product Designer',
    level: 'Senior',
    num_questions: 5,
    focus_areas: [],
    questions: [],
    mode: 'conversational',
    interview_id: 41,
  },
  profile: {
    name: 'Maya Chen',
    predicted_role: 'Senior Product Designer',
    experience_level: 'Senior',
    skills: candidates[0].skills,
    summary: candidates[0].summary,
  },
};

/* A screening run, as /pipeline/run sends it, with no job description: the
 * requirements are the role's words and the skills asked for. Each score is
 * worked out the way the backend's ATS weighs it (skills 45%, experience 30%,
 * role 15%, education 10%), and its verdict follows from it. */
const REQUIRED = ['Figma', 'User research'];
const MIN_YEARS = 3;

const verdictFor = score => (
  score >= 75 ? 'Strong Fit' : score >= 55 ? 'Good Fit' : score >= 35 ? 'Consider' : 'No Match'
);

export const pipeline = (ids, role = 'Product Designer') => {
  const keywords = role.toLowerCase().split(/\s+/);
  const jd = {
    required_skills: REQUIRED,
    nice_to_have_skills: [],
    min_experience_years: MIN_YEARS,
    education_requirement: '',
    seniority_level: '',
    role_keywords: keywords,
  };
  const ranked = candidates
    .filter(c => !ids?.length || ids.includes(c.id))
    .map((c) => {
      const has = skill => c.skills.some(s => s.toLowerCase() === skill.toLowerCase());
      const matched = REQUIRED.filter(has);
      const skills = Math.round((100 * matched.length) / REQUIRED.length);
      const experience = Math.min(100, Math.round((100 * c.total_experience_years) / MIN_YEARS));
      const roleMatch = keywords.some(word => c.predicted_role.toLowerCase().includes(word)) ? 100 : 40;
      const education = c.education?.length ? 80 : 50;
      const score = Math.round(skills * 0.45 + experience * 0.3 + roleMatch * 0.15 + education * 0.1);
      return {
        candidate_id: c.id,
        name: c.name,
        email: c.email,
        ats_score: score,
        skills_match: skills,
        experience_match: experience,
        role_match: roleMatch,
        education_match: education,
        matched_skills: matched,
        missing_skills: REQUIRED.filter(skill => !has(skill)),
        verdict: verdictFor(score),
        auto_reject: false,
        rejection_reason: null,
        predicted_role: c.predicted_role,
        experience_level: c.experience_level,
        total_experience_years: c.total_experience_years,
        location: c.location,
        summary: c.summary,
        skills: c.skills,
      };
    })
    .sort((a, b) => b.ats_score - a.ats_score);
  const count = verdict => ranked.filter(r => r.verdict === verdict).length;
  return {
    role,
    total_screened: ranked.length,
    elapsed_ms: 1240,
    jd_requirements: jd,
    results: ranked,
    shortlist: ranked.filter(r => !r.auto_reject).slice(0, 5),
    stats: {
      strong_fit: count('Strong Fit'),
      good_fit: count('Good Fit'),
      consider: count('Consider'),
      no_match: count('No Match'),
    },
  };
};
