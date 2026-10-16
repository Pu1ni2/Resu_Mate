// @vitest-environment node
// (it reads stylesheets only, and Tailwind's compiler runs in Node)
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  read, rules, declarations, classesIn, selectorsIn, legacyClasses, tailwindUtility, fontSizes,
} from './cssForTests';

/* studio-auth.css is the sign-in pages' design, while the legacy stylesheets
 * style plain elements, form fields and common class names across the whole
 * app. jsdom loads no CSS, so these read the stylesheets themselves. The
 * design's own button classes were the legacy amber buttons' names. */

const css = read('studio-auth.css');
const authRules = rules(css);
const authClasses = [...new Set(authRules.flatMap(r => classesIn(r.selector)))];
const rule = selector => declarations(authRules.find(r => r.selector === selector && !r.media).body);

describe('the sign-in stylesheet', () => {
  it('loads in the same layer as the homepage design, above the legacy stylesheets', () => {
    expect(read('index.css')).toContain("@import './studio-auth.css' layer(components);");
  });

  it('reaches nothing outside the sign-in pages', () => {
    const loose = authRules
      .flatMap(r => selectorsIn(r.selector))
      .filter(s => !s.startsWith('.studio-auth') && !s.startsWith('html:has(.studio-auth'));
    expect(loose).toEqual([]);
  });

  it("undoes the browser's button box, and the legacy fading of disabled buttons and fields", () => {
    expect(rule('.studio-auth button')).toMatchObject({ border: '0', background: 'transparent' });
    expect(rule('.studio-auth :where(button, input, select)')).toMatchObject({ font: 'inherit', color: 'inherit' });
    expect(rule('.studio-auth :where(button, input):disabled').opacity).toBe('1');
  });

  it('undoes the legacy grey paragraphs, heading colours and blue links', () => {
    expect(rule('.studio-auth :where(h1, h2, h3, h4, h5, h6, p)')).toMatchObject({ font: 'inherit', color: 'inherit' });
    expect(rule('.studio-auth a').color).toBe('inherit');
  });

  it("shows focus as the design's rust ring, and none on a heading given focus", () => {
    const focus = '.studio-auth button:focus-visible, .studio-auth a:focus-visible, .studio-auth input:focus-visible, .studio-auth select:focus-visible';
    expect(rule(focus).outline).toBe('2px solid var(--rust)');
    expect(rule('.studio-auth [tabindex="-1"]:focus').outline).toBe('none');
  });

  it('shares no class name with the legacy stylesheets', () => {
    const legacy = legacyClasses();
    expect(legacy.names.has('btn')).toBe(true); // the design file's name, which is why it is .cta here
    expect(authClasses.filter(name => legacy.names.has(name))).toEqual([]);
  });

  it('uses no class name Tailwind makes a utility of', async () => {
    const generates = await tailwindUtility();
    expect(authClasses.length).toBeGreaterThan(55);
    expect(authClasses.filter(generates)).toEqual([]);
  });

  it('names its animations studio-auth-, as keyframe names are global', () => {
    const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter(name => !name.startsWith('studio-auth-'))).toEqual([]);
  });

  it('sets no text smaller than 11px', () => {
    const sizes = fontSizes(authRules);
    expect(sizes.length).toBeGreaterThan(40);
    expect(sizes.filter(({ size }) => size < 11)).toEqual([]);
  });
});

/* Every page is near-black until the app's code has run, so index.html paints
 * the sign-in pages cream meanwhile, as it does the homepage. */
describe('the sign-in pages before the app starts', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
  const mark = (pathname) => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const attributes = {};
    const page = { documentElement: { setAttribute: (name, value) => { attributes[name] = value; } } };
    new Function('location', 'document', script)({ pathname }, page);
    return attributes['data-boot'];
  };

  it.each(['/hiring/login', '/hiring/register', '/hiring/forgot', '/hiring/reset', '/candidate/login'])(
    '%s is marked by index.html', (pathname) => {
      expect(mark(pathname)).toBe('studio');
    },
  );

  it.each(['/terms', '/privacy', '/privacy/delete', '/no/such/page', '/hiringx'])(
    '%s, in the same design, is marked too', (pathname) => {
      expect(mark(pathname)).toBe('studio');
    },
  );

  it.each(['/hiring', '/hiring/', '/hiring/focus', '/hiring/sourcer', '/candidate/dashboard', '/candidate/dashboard/interview', '/dashboard'])(
    '%s, a product page, is not', (pathname) => {
      expect(mark(pathname)).toBeUndefined();
    },
  );

  it("is painted the sign-in design's own paper while nothing is drawn yet", () => {
    const boot = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    expect(boot).toContain('html[data-boot="studio"]:has(#root:empty)');
    expect(boot).toContain(`background: ${rule('.studio-auth')['--paper']}`);
  });
});
