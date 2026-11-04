// @vitest-environment node
// (it reads a stylesheet only)
import { describe, it, expect } from 'vitest';

import { read, rules, declarations } from './cssForTests';

/* The workspace frame's own rules, beyond what every Studio sheet is held to
 * (studio-sheets.test.js). */

const list = rules(read('studio-workspace.css'));
const at = (selector, media) => list
  .filter(rule => rule.selector === selector && rule.media.includes(media))
  .map(rule => declarations(rule.body));

/* Measured in a browser: Sign Out was below the fold at 1440x900, 1366x768,
 * 1280x800 and 1536x864, under the sidebar's note, and fits at each without
 * it. A screen 1080px tall keeps the note. */
describe("the sidebar on a laptop's height", () => {
  it('leaves out its note up to 960px tall, so the account and Sign Out stay in view', () => {
    expect(at('.studio-workspace .sw-sidebar-note', 'max-height: 960px'))
      .toEqual([expect.objectContaining({ display: 'none' })]);
  });

  it('keeps the account at its foot without the note', () => {
    expect(at('.studio-workspace .sw-sidebar-bottom', 'max-height: 960px'))
      .toEqual([expect.objectContaining({ 'margin-top': 'auto' })]);
  });
});
