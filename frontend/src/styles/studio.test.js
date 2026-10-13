// @vitest-environment node
// (it reads stylesheets only, and Tailwind's compiler runs in Node)
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { compile } from 'tailwindcss';

/* studio.css is the homepage's design, while the legacy stylesheets style plain
 * elements and common class names across the whole app. jsdom loads no CSS, so
 * these read the stylesheets themselves. They catch the clashes the port had
 * to work around (Tailwind's own .container, global.css's .hero and .skill),
 * and a homepage button left with the browser's grey box. */

const frontend = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

/** Every rule as { media, selector, body }, one @media level deep. */
function rules(css, media = '') {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open === -1) break;
    // Anything before the selector that ends in ";" is a statement (@import).
    const head = text.slice(i, open).split(';').pop().trim().replace(/\s+/g, ' ');
    let depth = 1;
    let j = open + 1;
    for (; depth && j < text.length; j += 1) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') depth -= 1;
    }
    const body = text.slice(open + 1, j - 1);
    if (head.startsWith('@media')) out.push(...rules(body, head));
    else if (!head.startsWith('@')) out.push({ media, selector: head, body });
    i = j;
  }
  return out;
}

const declarations = body => Object.fromEntries(body.split(';')
  .map(d => d.split(':'))
  .filter(parts => parts.length > 1)
  .map(([prop, ...value]) => [prop.trim(), value.join(':').trim()]));

const classesIn = selector => [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]);

/** A selector list's selectors: its commas outside :where(…) and the like. */
function selectorsIn(list) {
  const parts = [''];
  let depth = 0;
  for (const ch of list) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) parts.push('');
    else parts[parts.length - 1] += ch;
  }
  return parts.map(s => s.trim());
}

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
    const legacy = [...read('index.css').matchAll(/@import '\.\/([\w-]+\.css)' layer\(legacy\)/g)].map(m => m[1]);
    expect(legacy.length).toBeGreaterThan(0);
    const legacyClasses = new Set(legacy.flatMap(file => rules(read(file)).flatMap(r => classesIn(r.selector))));
    expect(studioClasses.filter(name => legacyClasses.has(name))).toEqual([]);
  });

  it('uses no class name Tailwind makes a utility of', async () => {
    const tailwind = path.join(frontend, 'node_modules/tailwindcss');
    const compiler = await compile("@import 'tailwindcss/theme.css'; @import './src/styles/theme.css'; @tailwind utilities;", {
      base: frontend,
      loadStylesheet: async (id, base) => {
        const file = id.startsWith('tailwindcss/') ? path.join(tailwind, id.slice('tailwindcss/'.length)) : path.resolve(base, id);
        return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
      },
    });
    const generates = name => new RegExp(`\\.${name}(?![\\w-])`).test(compiler.build([name]));
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
    const sizes = studioRules.flatMap(({ selector, body }) => {
      const d = declarations(body);
      const px = [...(d['font-size'] || '').matchAll(/([\d.]+)px/g)].map(m => Number(m[1]));
      const shorthand = (d.font || '').match(/([\d.]+)px/);
      if (shorthand) px.push(Number(shorthand[1]));
      return px.map(size => ({ size, selector }));
    });
    expect(sizes.length).toBeGreaterThan(30);
    expect(sizes.filter(({ size }) => size < 11)).toEqual([]);
  });
});

/* Every page is near-black until the app's code has run, so index.html paints
 * the homepage cream meanwhile; otherwise it blinked dark on each visit. */
describe('the homepage before the app starts', () => {
  const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');

  it('is marked by index.html, and no other page is', () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const mark = (pathname) => {
      const attributes = {};
      const page = { documentElement: { setAttribute: (name, value) => { attributes[name] = value; } } };
      new Function('location', 'document', script)({ pathname }, page);
      return attributes['data-boot'];
    };
    expect(mark('/')).toBe('home');
    expect(mark('/hiring/login')).toBeUndefined();
    expect(mark('/terms')).toBeUndefined();
  });

  it("is painted the homepage's own cream while nothing is drawn yet", () => {
    const boot = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    expect(boot).toContain('html[data-boot="home"]:has(#root:empty)');
    expect(boot).toContain(`background: ${rule('.studio')['--paper']}`);
    // :empty fails on so much as a space, and the cream would never show.
    expect(html).toContain('<div id="root"></div>');
  });
});
