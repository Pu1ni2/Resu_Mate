// @vitest-environment node
// (it reads stylesheets only)
import { describe, it, expect } from 'vitest';

import { read, rules, declarations, selectorsIn } from './cssForTests';

/* An iPhone zooms in on a text box, menu or text area under 16px when it's
 * tapped, and stays zoomed in after. On a phone, the Candidates search and its
 * order menu were 12px, and the other fields 14px. */

const TOUCH = '(hover: none) and (pointer: coarse)';

const touchFields = rules(read('design-system.css'))
  .filter(rule => rule.media.includes(TOUCH))
  .filter(rule => selectorsIn(rule.selector).some(s => /^(input|select|textarea)\b/.test(s)));

const inputs = () => selectorsIn(touchFields[0].selector).find(s => s.startsWith('input'));

describe('on a touch screen, the fields', () => {
  it('are one rule for every text box, menu and text area', () => {
    expect(touchFields).toHaveLength(1);
    expect(selectorsIn(touchFields[0].selector)).toEqual(expect.arrayContaining(['select', 'textarea']));
    expect(inputs()).toBeTruthy();
  });

  it('are 16px, whatever a page sets', () => {
    expect(declarations(touchFields[0].body)['font-size']).toBe('16px !important');
  });

  it('leave out the inputs that hold no text', () => {
    expect(inputs()).toMatch(/^input:not\(/);
    for (const type of ['checkbox', 'radio', 'range', 'file']) expect(inputs()).toContain(`[type='${type}']`);
  });

  // For !important, an earlier layer outranks a later one: the pages' own
  // sizes, in the later layers, can't undo it.
  it('are set in the first layer', () => {
    const index = read('index.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(index.match(/@layer ([\w\s,-]+);/)[1].split(',')[0].trim()).toBe('legacy');
    expect(index).toMatch(/@import '\.\/design-system\.css' layer\(legacy\);/);
  });

  // Inside the first layer, a later forced size could still win. That layer is
  // being emptied, and forces no other.
  it('are outranked by no other forced size in the first layer', () => {
    const legacy = [...read('index.css').matchAll(/@import '\.\/([\w-]+\.css)' layer\(legacy\)/g)].map(m => m[1]);
    const forced = legacy.flatMap(file => rules(read(file))
      .filter(rule => /font(-size)?\s*:[^;]*!important/.test(rule.body))
      .map(rule => `${file} ${rule.selector}`));
    expect(forced).toEqual([`design-system.css ${touchFields[0].selector}`]);
  });
});

// "Original order" at 16px needs more than the menu's 150px, or a phone's 120px.
describe('the Candidates order menu, on a touch screen', () => {
  const menu = rules(read('studio-dashboard.css'))
    .map((rule, at) => ({ ...rule, at }))
    .filter(rule => rule.selector === '.studio-dashboard .sd-filterbar select');
  const touch = menu.filter(rule => rule.media.includes(TOUCH));

  it('may grow to fit its label', () => {
    expect(touch.map(rule => declarations(rule.body)['max-width'])).toEqual(['none']);
  });

  // The rules are as specific as each other, so the last one wins.
  it('grows after every rule that holds it in', () => {
    const limits = menu.filter(rule => !rule.media.includes(TOUCH) && declarations(rule.body)['max-width']);
    expect(limits.length).toBeGreaterThan(1);
    expect(limits.filter(rule => rule.at > touch[0].at)).toEqual([]);
  });
});
