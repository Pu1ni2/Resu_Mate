// @vitest-environment node
// (it reads stylesheets only, and Tailwind's compiler runs in Node)
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  read, rules, declarations, classesIn, selectorsIn, legacyClasses, tailwindUtility, fontSizes,
} from './cssForTests';

/* studio.css is the homepage's design, while the legacy stylesheets style plain
 * elements and common class names across the whole app. jsdom loads no CSS, so
 * these read the stylesheets themselves. They catch the clashes the port had
 * to work around (Tailwind's own .container, global.css's .hero and .skill),
 * and a homepage button left with the browser's grey box. */

const frontend = path.resolve(__dirname, '../..');

const studio = read('studio.css');
const studioRules = rules(studio);
const studioClasses = [...new Set(studioRules.flatMap(r => classesIn(r.selector)))];
const rule = selector => declarations(studioRules.find(r => r.selector === selector && !r.media).body);

describe('the Studio stylesheet', () => {
  it('loads above the legacy stylesheets and below the utilities', () => {
    const index = read('index.css');
    const order = index.match(/@layer ([\w\s,]+);/)[1].split(',').map(name => name.trim());
    expect(order.indexOf('components')).toBeGreaterThan(order.indexOf('legacy'));
    expect(order.indexOf('components')).toBeLessThan(order.indexOf('utilities'));
    expect(index).toContain("@import './studio.css' layer(components);");
  });

  it('reaches nothing outside the homepage', () => {
    const loose = studioRules
      .flatMap(r => selectorsIn(r.selector))
      .filter(s => !s.startsWith('.studio') && !s.startsWith('html:has(.studio'));
    expect(loose).toEqual([]);
  });

  it("undoes the browser's button box, and the legacy fading of disabled buttons", () => {
    expect(rule('.studio button')).toMatchObject({ border: '0', background: 'transparent', font: 'inherit', color: 'inherit' });
    expect(rule('.studio button:disabled').opacity).toBe('1');
  });

  it("undoes the legacy grey paragraphs, heading colours, blue links and 1.6 line height", () => {
    expect(rule('.studio :where(h1, h2, h3, h4, h5, h6, p)')).toMatchObject({ font: 'inherit', color: 'inherit' });
    expect(rule('.studio a')).toMatchObject({ color: 'inherit', 'text-decoration': 'none' });
    expect(rule('.studio')['line-height']).toBe('normal');
  });

  it("shows focus as the design's rust ring, without the legacy rounding", () => {
    expect(rule('.studio button:focus-visible, .studio a:focus-visible, .studio [tabindex]:focus-visible').outline)
      .toBe('3px solid var(--rust)');
    expect(rule('.studio :where(a, button, [tabindex])')['border-radius']).toBe('0');
  });

  it('shares no class name with the legacy stylesheets', () => {
    const legacy = legacyClasses();
    expect(legacy.files.length).toBeGreaterThan(0);
    expect(studioClasses.filter(name => legacy.names.has(name))).toEqual([]);
  });

  it('uses no class name Tailwind makes a utility of', async () => {
    const generates = await tailwindUtility();
    expect(generates('container')).toBe(true); // the design file's name, which is why it is .wrap here
    expect(studioClasses.length).toBeGreaterThan(80);
    expect(studioClasses.filter(generates)).toEqual([]);
  });

  it('names its animations studio-, as keyframe names are global', () => {
    const names = [...studio.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter(name => !name.startsWith('studio-'))).toEqual([]);
  });

  it('sets no text smaller than 11px', () => {
    const sizes = fontSizes(studioRules);
    expect(sizes.length).toBeGreaterThan(30);
    expect(sizes.filter(({ size }) => size < 11)).toEqual([]);
  });
});

/* Every page is near-black until the app's code has run, so index.html paints
 * the homepage cream meanwhile; otherwise it blinked dark on each visit. */
describe('the homepage before the app starts', () => {
  const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');

  it('is marked by index.html, as the sign-in pages are, and the product pages are not', () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const mark = (pathname) => {
      const attributes = {};
      const page = { documentElement: { setAttribute: (name, value) => { attributes[name] = value; } } };
      new Function('location', 'document', script)({ pathname }, page);
      return attributes['data-boot'];
    };
    expect(mark('/')).toBe('studio');
    expect(mark('/hiring/login')).toBe('studio');
    expect(mark('/terms')).toBeUndefined();
  });

  it("is painted the homepage's own cream while nothing is drawn yet", () => {
    const boot = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    expect(boot).toContain('html[data-boot="studio"]:has(#root:empty)');
    expect(boot).toContain(`background: ${rule('.studio')['--paper']}`);
    // :empty fails on so much as a space, and the cream would never show.
    expect(html).toContain('<div id="root"></div>');
  });
});
