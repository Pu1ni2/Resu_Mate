import { describe, it, expect } from 'vitest';
import { read, rules, selectorsIn, declarations } from './cssForTests';

/* The online lookup's steps, in the candidate file's scan bar. Every one of
 * them was bright terminal green on the pale bar, failures too: a rule for
 * the old dark scanning screen, with !important, which nothing in a later
 * layer can beat. */

const legacy = [...read('index.css').matchAll(/@import '\.\/([\w-]+\.css)' layer\(legacy\);/g)].map(m => m[1]);
const forStep = selector => selectorsIn(selector).some(s => /\.scanner-log(?![\w-])/.test(s));

describe("the lookup's steps", () => {
  it('are given no colour by the old stylesheets that nothing could override', () => {
    expect(legacy.length).toBeGreaterThan(0);
    const forced = legacy.flatMap(file => rules(read(file))
      .filter(r => forStep(r.selector) && /color\s*:[^;]*!important/.test(r.body))
      .map(r => `${file}: ${r.selector}`));
    expect(forced).toEqual([]);
  });

  it("are the theme's colours in the candidate file: green for a step that found something, red for one that failed", () => {
    const list = rules(read('studio-focus.css'));
    const colourOf = selector => declarations(list.find(r => r.selector === selector)?.body || '').color;
    expect(colourOf('.studio-focus .scanner-log.success .scanner-prefix')).toBe('var(--color-positive)');
    expect(colourOf('.studio-focus .scanner-log.error')).toBe('var(--color-critical)');
  });
});
