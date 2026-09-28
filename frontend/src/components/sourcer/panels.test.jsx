import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';

import StatTiles from './StatTiles';
import LiveSample from './LiveSample';
import PopulationMap from './PopulationMap';
import JudgingNow, { safeUrl } from './JudgingNow';
import FilterComparison from './FilterComparison';
import LiveLog from './LiveLog';
import { formatCost, formatElapsed } from './format';
import { talentMapReducer as reduce, initialState } from './talentMapModel';

/* Each panel shows what the talent-map state says, and nothing it doesn't. */

afterEach(cleanup);

const person = (pid, extra = {}) => ({ pid, source: pid.split(':')[0], name: pid.split(':')[1], avatar_url: '', ...extra });
const found = (pid, extra) => ({ type: 'found', person: person(pid, extra) });
const judged = (pid, verdict, filter_match = false, extra = {}) => ({
  type: 'judged', pid, verdict, filter_match, score: verdict === 'shortlist' ? 82 : 25,
  criteria: [], judgement: `Judgement for ${pid}.`, miss_reason: null, ms: 111, tokens: 439, ...extra,
});

/* A state built the way the page builds it: from events, through the reducer. */
function stateFrom(events) {
  return reduce(reduce(initialState, { type: 'start' }), { type: 'events', events });
}

describe('format', () => {
  it('shows elapsed time as m:ss', () => {
    expect(formatElapsed(203)).toBe('3:23');
    expect(formatElapsed(0)).toBe('0:00');
  });

  it('shows dollars only when there is a price, tokens otherwise', () => {
    expect(formatCost(2.391, 0)).toBe('$2.39');
    expect(formatCost(0.004, 0)).toBe('$0.0040');
    expect(formatCost(null, 12_345)).toBe('12.3k tokens');
    expect(formatCost(null, 800)).toBe('800 tokens');
  });
});

describe('StatTiles', () => {
  const counts = { found: 81, judged: 43, shortlisted: 6, byFilter: 2, filterWouldShow: 20 };

  it('shows screened of found, judgements, shortlisted and the run figures', () => {
    render(<StatTiles counts={counts} stats={{ per_sec: 2.29, elapsed_s: 203, cost_usd: 2.39 }} />);
    const screened = screen.getByText('Screened').parentElement;
    expect(within(screened).getByText('43')).toBeTruthy();
    expect(within(screened).getByText('/ 81')).toBeTruthy();
    expect(within(screen.getByText('Shortlisted').parentElement).getByText('6')).toBeTruthy();
    expect(screen.getByText('2.3')).toBeTruthy();
    expect(screen.getByText('3:23')).toBeTruthy();
    expect(screen.getByText('$2.39')).toBeTruthy();
  });

  it('shows tokens, not a dollar figure, when prices are not configured', () => {
    render(<StatTiles counts={counts} stats={{ tokens_in: 9000, tokens_out: 1000, cost_usd: null }} />);
    expect(screen.getByText('10.0k tokens')).toBeTruthy();
    expect(screen.queryByText(/\$/)).toBeNull();
  });
});

describe('LiveSample', () => {
  it('says what it will show before anyone is read', () => {
    render(<LiveSample state={stateFrom([])} />);
    expect(screen.getByText(/appear here as they are read/)).toBeTruthy();
  });

  it('shows the latest people read, newest first, and how each landed', () => {
    const state = stateFrom([
      found('github:ada lovelace', { avatar_url: 'https://a/ada.png' }),
      found('web:grace hopper'),
      judged('github:ada lovelace', 'shortlist'),
      judged('web:grace hopper', 'passed'),
    ]);
    render(<LiveSample state={state} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map(li => li.getAttribute('title'))).toEqual(['grace hopper: passed on', 'ada lovelace: shortlisted']);
    expect(screen.getByText('2 of the last 2 read')).toBeTruthy();
    // A photo where the source has one, initials where it doesn't.
    expect(items[1].querySelector('img').getAttribute('src')).toBe('https://a/ada.png');
    expect(within(items[0]).getByText('GH')).toBeTruthy();
  });

  it('falls back to initials when a photo fails to load', () => {
    const state = stateFrom([found('github:ada lovelace', { avatar_url: 'https://a/broken.png' }), judged('github:ada lovelace', 'shortlist')]);
    render(<LiveSample state={state} />);
    fireEvent.error(screen.getByRole('listitem').querySelector('img'));
    expect(screen.getByText('AL')).toBeTruthy();
  });
});

describe('PopulationMap', () => {
  it('has one cell per person, coloured by how they landed', () => {
    const state = stateFrom([
      found('github:a'), found('github:b'), found('web:c'), found('upload:d'),
      judged('github:a', 'shortlist', false),
      judged('github:b', 'shortlist', true),
      judged('web:c', 'passed', true),
    ]);
    render(<PopulationMap state={state} />);
    const cells = [...screen.getByTestId('population-map').children];
    expect(cells).toHaveLength(4);
    expect(cells.map(c => c.className.match(/bg-(accent|ink(?!-)|ink-faint\/50|data-track)/)[1]))
      .toEqual(['accent', 'ink', 'ink-faint/50', 'data-track']);
    // The picture is hidden from screen readers; the same facts are in text.
    expect(screen.getByText(/Screened 3 of 4\. Shortlisted 2: 1 a filter would find too, 1 only by reading\./)).toBeTruthy();
    expect(screen.getByText('3 / 4 · one cell = one person')).toBeTruthy();
  });

  it('says how many a keyword filter would have shown', () => {
    const state = stateFrom([found('web:a'), found('web:b'), judged('web:a', 'passed', true), judged('web:b', 'passed', false)]);
    render(<PopulationMap state={state} />);
    const line = screen.getByText(/a title \+ keyword filter would show/);
    expect(within(line).getByText('1')).toBeTruthy();
  });
});

describe('JudgingNow', () => {
  const plan = { type: 'plan', plan: { criteria: [
    { id: 'c1', label: 'Python depth', kind: 'must' },
    { id: 'c2', label: 'Shipped a product', kind: 'nice' },
    { id: 'c3', label: 'Based in Boston', kind: 'nice' },
  ] } };

  it('shows the latest person, a row per criterion with its level in words, and the judgement', () => {
    const state = stateFrom([plan,
      found('github:ada lovelace', { url: 'https://github.com/ada', headline: 'Engine builder' }),
      judged('github:ada lovelace', 'shortlist', false, {
        criteria: [{ id: 'c1', value: '12 repos in Python', level: 'strong' }, { id: 'c2', value: 'Analytical Engine', level: 'partial' }],
        judgement: 'Ships real tools in Python.',
      }),
    ]);
    render(<JudgingNow state={state} />);
    expect(screen.getByText('ada lovelace')).toBeTruthy();
    expect(screen.getByText('12 repos in Python')).toBeTruthy();
    expect(screen.getByText('strong')).toBeTruthy();
    expect(screen.getByText('partial')).toBeTruthy();
    // A criterion the model said nothing about reads as "not shown", not as a miss.
    expect(screen.getByText('not shown')).toBeTruthy();
    expect(screen.getByText('Ships real tools in Python.')).toBeTruthy();
    expect(screen.getByText('Shortlist')).toBeTruthy();
    expect(screen.getByText('111 ms · 439 tokens')).toBeTruthy();
    expect(screen.getByRole('link', { name: /View profile/ }).getAttribute('href')).toBe('https://github.com/ada');
  });

  it('never links to anything but a web address', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(safeUrl('https://x.dev')).toBe('https://x.dev');
    const state = stateFrom([plan, found('web:x', { url: 'javascript:alert(1)' }), judged('web:x', 'passed')]);
    render(<JudgingNow state={state} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('waits for the first judgement', () => {
    render(<JudgingNow state={stateFrom([plan])} />);
    expect(screen.getByText(/being read appears here/)).toBeTruthy();
  });
});

describe('FilterComparison', () => {
  it('splits the shortlist into what a filter reaches and what only reading found, with why', () => {
    const state = stateFrom([
      found('github:a'), found('github:b'), found('web:c'), found('web:d'),
      judged('github:a', 'shortlist', false, { miss_reason: 'non_standard_title' }),
      judged('github:b', 'shortlist', false, { miss_reason: 'career_pivot' }),
      judged('web:c', 'shortlist', true),
      judged('web:d', 'passed', true),
    ]);
    render(<FilterComparison state={state} />);
    expect(screen.getByText('3 shortlisted')).toBeTruthy();
    const boolean = screen.getByText('Boolean + filters').parentElement;
    expect(within(boolean).getByText('1')).toBeTruthy();
    const reading = screen.getByText('Read everyone').parentElement;
    expect(within(reading).getByText('+2')).toBeTruthy();
    const row = label => screen.getByText(label).parentElement;
    expect(within(row('non-standard title')).getByText('1')).toBeTruthy();
    expect(within(row('career pivot')).getByText('1')).toBeTruthy();
    expect(within(row('no brand-name employer')).getByText('0')).toBeTruthy();
    expect(within(row('matched the filter anyway')).getByText('1')).toBeTruthy();
  });
});

describe('LiveLog', () => {
  it('lists judgements newest first, numbered by their place in the search', () => {
    const state = stateFrom([
      found('github:ada'), found('web:grace'),
      judged('web:grace', 'passed', false, { judgement: 'Design, not backend.' }),
      judged('github:ada', 'shortlist', false, { judgement: 'Ships Python tools.' }),
    ]);
    render(<LiveLog state={state} />);
    const rows = screen.getAllByRole('row').slice(1); // after the header row
    expect(rows.map(r => [...r.children].map(td => td.textContent))).toEqual([
      ['1', 'ada', 'Shortlist', 'Ships Python tools.'],
      ['2', 'grace', 'Passed on', 'Design, not backend.'],
    ]);
  });
});
