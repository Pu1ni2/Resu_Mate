// @vitest-environment node
// (it reads a stylesheet only)
import { describe, it, expect } from 'vitest';

import { read, rules, declarations } from './cssForTests';

/* Asking for less motion stopped animations short, but one that loops
 * forever still played hundreds of times a second, and the page still glided
 * where it scrolled. The rule, in the first stylesheet index.css loads,
 * reaches every element. */

const reduced = rules(read('design-system.css'))
  .filter(rule => rule.media.includes('prefers-reduced-motion: reduce') && rule.selector.split(',').map(s => s.trim()).includes('*'))
  .map(rule => declarations(rule.body));

describe('less motion, asked for', () => {
  it('is one rule for every element, before and after included', () => {
    expect(reduced).toHaveLength(1);
  });

  it('stops every animation and transition short, and plays an animation once', () => {
    expect(reduced[0]).toMatchObject({
      'animation-duration': '0.01ms !important',
      'animation-iteration-count': '1 !important',
      'transition-duration': '0.01ms !important',
    });
  });

  it('jumps rather than glides where the page scrolls', () => {
    expect(reduced[0]['scroll-behavior']).toBe('auto !important');
  });
});
