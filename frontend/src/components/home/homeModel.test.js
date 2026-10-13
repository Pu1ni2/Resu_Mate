import { describe, it, expect } from 'vitest';

import { homeReducer as reduce, initialState, questionsFor } from './homeModel';
import { PEOPLE, GENERAL_QUESTIONS } from './samples';

/* The candidate file and the product preview read this one state, so it is
 * what keeps them on the same person, and what a screen reader is told. */

const after = (...actions) => actions.reduce(reduce, initialState);

describe('the homepage at first', () => {
  it('shows Alex on Screen, at the first question, and announces nothing', () => {
    expect(initialState).toEqual({ person: 0, tab: 'screen', question: 0, announcement: '' });
  });
});

describe('choosing a person', () => {
  it('shows them, starts their questions again, and says who it is', () => {
    const state = after({ type: 'nextQuestion' }, { type: 'choose', person: 1 });
    expect(state).toMatchObject({ person: 1, question: 0, tab: 'screen' });
    expect(state.announcement).toBe('Showing sample profile: Jordan Lee, Software engineer · 5 years.');
  });

  it('leaves the preview on the tab it was on', () => {
    expect(after({ type: 'show', tab: 'interview' }, { type: 'choose', person: 2 }).tab).toBe('interview');
  });
});

describe('a preview tab', () => {
  it.each([
    ['screen', 'Screen preview: three sample candidates.'],
    ['interview', 'Interview preview: Alex Kim.'],
    ['evaluate', 'Evaluate preview: Alex Kim.'],
    ['candidate', 'Candidate portal preview: Alex Kim.'],
  ])('%s says what it shows', (tab, said) => {
    const state = after({ type: 'show', tab });
    expect(state.tab).toBe(tab);
    expect(state.announcement).toBe(said);
  });

  it('keeps the person and the question', () => {
    const state = after({ type: 'choose', person: 2 }, { type: 'nextQuestion' }, { type: 'show', tab: 'evaluate' });
    expect(state).toMatchObject({ person: 2, question: 1 });
  });
});

describe('"View" on a shortlisted candidate', () => {
  it("opens that person on Evaluate in one step, and says so", () => {
    const state = after({ type: 'view', person: 1 });
    expect(state).toMatchObject({ person: 1, tab: 'evaluate', question: 0 });
    expect(state.announcement).toBe('Evaluate preview: Jordan Lee.');
  });
});

describe('the interview questions', () => {
  it("start with the one about the person, then the two anyone gets", () => {
    expect(questionsFor(2)).toEqual([PEOPLE[2].question, ...GENERAL_QUESTIONS]);
  });

  it('go round all three and back to the first, reading each one out', () => {
    const one = after({ type: 'nextQuestion' });
    expect(one.question).toBe(1);
    expect(one.announcement).toBe(`“${GENERAL_QUESTIONS[0]}”`);
    expect(after({ type: 'nextQuestion' }, { type: 'nextQuestion' }).question).toBe(2);
    const round = after({ type: 'nextQuestion' }, { type: 'nextQuestion' }, { type: 'nextQuestion' });
    expect(round.question).toBe(0);
    expect(round.announcement).toBe(`“${PEOPLE[0].question}”`);
  });
});

describe('"Meet the next sample candidate"', () => {
  it('shows the next person, and after the last, the first', () => {
    expect(after({ type: 'meetNext' }).person).toBe(1);
    expect(after({ type: 'meetNext' }, { type: 'meetNext' }).person).toBe(2);
    const round = after({ type: 'meetNext' }, { type: 'meetNext' }, { type: 'meetNext' });
    expect(round.person).toBe(0);
    expect(round.announcement).toBe('Showing sample profile: Alex Kim, Product designer · 6 years.');
  });
});

describe('an action it does not know', () => {
  it('changes nothing', () => {
    expect(reduce(initialState, { type: 'nonsense' })).toBe(initialState);
  });
});
