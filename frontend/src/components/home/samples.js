/* The homepage's sample candidates, interview questions and preview tabs, word
 * for word from the approved design (design-preview/studio-final.html). The
 * people are made up: the page uploads no résumé and starts no interview. */

export const PEOPLE = [
  {
    name: 'Alex Kim', label: 'Alex K.', initials: 'AK', role: 'Product designer · 6 years', title: 'Product designer', color: '#d9ddc7',
    summary: 'A systems thinker who turns complex workflows into clear, welcoming experiences.',
    skills: ['Design systems', 'Research', 'Prototyping'],
    evidence: ['Built a shared design system for a growing product team.', 'Brings user research into everyday product decisions.'],
    noteTitle: 'Curiosity meets craft.', note: 'Explore how Alex balances research insights with design intuition.',
    question: 'How did research change the direction of your most recent design project?',
  },
  {
    name: 'Jordan Lee', label: 'Jordan L.', initials: 'JL', role: 'Software engineer · 5 years', title: 'Software engineer', color: '#e9d8c7',
    summary: 'A thoughtful builder who connects reliable architecture with the people who use it.',
    skills: ['Python', 'APIs', 'Cloud systems'],
    evidence: ['Designed APIs that connect several internal products.', 'Enjoys mentoring teammates through technical decisions.'],
    noteTitle: 'Good systems. Better questions.', note: 'Ask Jordan what makes a service maintainable as the team grows.',
    question: 'Tell us about an architectural decision you revisited as your system grew.',
  },
  {
    name: 'Sam Rivera', label: 'Sam R.', initials: 'SR', role: 'Product manager · 7 years', title: 'Product manager', color: '#d6e1dc',
    summary: 'A collaborative problem solver who finds the signal in customer stories and product data.',
    skills: ['Product strategy', 'Analytics', 'Discovery'],
    evidence: ['Connected customer discovery to a product roadmap.', 'Brings engineering and design into planning early.'],
    noteTitle: 'A clear sense of direction.', note: 'Discover how Sam turns competing priorities into a shared plan.',
    question: 'How do you decide what to prioritize when customer needs compete?',
  },
];

// After the question tailored to the person, two the interview asks anyone.
export const GENERAL_QUESTIONS = [
  'Walk me through a hard problem you solved. How did you know your solution worked?',
  'Tell me about a time feedback changed your approach to a project.',
];

export const TABS = [
  { id: 'screen', number: '01', title: 'Screen' },
  { id: 'interview', number: '02', title: 'Interview' },
  { id: 'evaluate', number: '03', title: 'Evaluate' },
  { id: 'candidate', number: '04', title: 'Candidate portal' },
];

// The interview preview's sound wave: each bar's height, in px.
export const WAVE_BARS = [12, 19, 28, 40, 27, 18, 33, 44, 29, 16, 24, 36, 28, 19, 12];
