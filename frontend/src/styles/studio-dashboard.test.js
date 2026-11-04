// @vitest-environment node
// (it reads a stylesheet only)
import { describe, it, expect } from 'vitest';

import { read, rules, declarations } from './cssForTests';

/* The candidate collection's own rules, beyond what every Studio sheet is
 * held to (studio-sheets.test.js). */

const list = rules(read('studio-dashboard.css'));
const onPhones = selector => declarations(
  list.find(rule => rule.selector === selector && rule.media.includes('max-width: 500px'))?.body || '',
);

describe('the collection on a phone', () => {
  it('sets the order menu as small as the search beside it, so "Original order" fits', () => {
    const search = onPhones('.studio-dashboard .sd-filterbar input')['font-size'];
    expect(search).toBeTruthy();
    // At 14px, the menu's label was cut to "Original ord" in its 120px.
    expect(onPhones('.studio-dashboard .sd-filterbar select')['font-size']).toBe(search);
  });
});
