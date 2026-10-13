import { PEOPLE, GENERAL_QUESTIONS, TABS } from './samples';

/* What the homepage's candidate file and product preview show, and what a
 * screen reader hears when that changes. Plain functions, so the behaviour can
 * be tested without rendering the page. The file and the preview always show
 * the same person. */

export const initialState = { person: 0, tab: 'screen', question: 0, announcement: '' };

/** A person's interview questions: the one about them first, then the two anyone gets. */
export const questionsFor = person => [PEOPLE[person].question, ...GENERAL_QUESTIONS];

const tabTitle = id => TABS.find(tab => tab.id === id).title;

function choose(state, person) {
  const { name, role } = PEOPLE[person];
  return { ...state, person, question: 0, announcement: `Showing sample profile: ${name}, ${role}.` };
}

function show(state, tab) {
  const what = tab === 'screen' ? 'three sample candidates.' : `${PEOPLE[state.person].name}.`;
  return { ...state, tab, announcement: `${tabTitle(tab)} preview: ${what}` };
}

export function homeReducer(state, action) {
  switch (action.type) {
    case 'choose':
      return choose(state, action.person);
    case 'show':
      return show(state, action.tab);
    // "View" on a shortlisted candidate: that person, opened on Evaluate.
    case 'view':
      return show(choose(state, action.person), 'evaluate');
    case 'nextQuestion': {
      const questions = questionsFor(state.person);
      const question = (state.question + 1) % questions.length;
      return { ...state, question, announcement: `“${questions[question]}”` };
    }
    // "Meet the next sample candidate": after the last, the first again.
    case 'meetNext':
      return choose(state, (state.person + 1) % PEOPLE.length);
    default:
      return state;
  }
}
