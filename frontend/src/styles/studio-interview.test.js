import { describe, it, expect } from 'vitest';
import { read, rules, declarations } from './cssForTests';

/* The interview rooms are a page of their own over the rest of the app. The
 * voice room was part of the page, so the floating toolbar sat over it during
 * an interview; the video room covered everything, the toasts too. */

const ruleFor = (file, selector) => declarations(rules(read(file)).find(r => r.selector === selector && !r.media).body);
const layers = declarations(rules(read('design-system.css')).find(r => r.selector === ':root' && /--z-modal\s*:/.test(r.body)).body);
const stackOf = value => Number(value.replace(/^var\((--z-[\w-]+)\)$/, (_, name) => layers[name]));

describe('the interview rooms', () => {
  const room = ruleFor('studio-interview.css', '.studio-interview');

  it('cover the whole screen, and scroll within it', () => {
    expect(room.position).toBe('fixed');
    expect(room.inset).toBe('0');
    expect(room['overflow-y']).toBe('auto');
  });

  it('sit over the floating toolbar, and under the toasts', () => {
    expect(stackOf(room['z-index'])).toBeGreaterThan(stackOf(ruleFor('product-layer.css', '.pl-toolbar')['z-index']));
    expect(stackOf(room['z-index'])).toBeLessThan(stackOf(ruleFor('product-layer.css', '.pl-toast-container')['z-index']));
  });
});
