// @vitest-environment node
// (it reads files only)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { read, rules, fontSizes } from './cssForTests';

/* The text sizes, across every stylesheet index.css loads and the sizes the
 * components set themselves. The review of Oct 31 found working controls and
 * details at 9 to 11px; nothing is under 11px now, and 11px is for rare tags.
 * The Studio sheets' own guard (studio-sheets.test.js) covered only them. */

const styles = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(styles, '..');

const SHEETS = [...read('index.css').matchAll(/@import '\.\/([\w-]+\.css)'/g)].map(m => m[1]);

function components(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return components(file);
    return /\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name) ? [file] : [];
  });
}

/* A tag, the one thing 11px is for: a label in capitals, set so or typed so,
 * and then tracked wide (0.07em or more; a size in px is taken at 11px). */
const TRACKED = 0.07;
const wide = (value, unit) => (unit === 'em' ? value : value / 11) >= TRACKED;

function tagRule(body) {
  if (/text-transform:\s*uppercase/.test(body)) return true;
  const spacing = body.match(/letter-spacing:\s*([\d.]+)(em|px)/);
  return Boolean(spacing) && wide(Number(spacing[1]), spacing[2]);
}

function tagStyle(style) {
  if (/textTransform:\s*['"]uppercase['"]/.test(style)) return true;
  const spacing = style.match(/letterSpacing:\s*['"]?([\d.]+)(em|px)?/);
  return Boolean(spacing) && wide(Number(spacing[1]), spacing[2] || 'px');
}

// The style={{ … }} a size is in, or else its line.
function around(text, at) {
  const open = text.lastIndexOf('{{', at);
  const close = text.indexOf('}}', at);
  if (open !== -1 && close !== -1 && !text.slice(open, at).includes('}}')) return text.slice(open, close);
  const start = text.lastIndexOf('\n', at) + 1;
  const end = text.indexOf('\n', at);
  return text.slice(start, end === -1 ? text.length : end);
}

/* What a component sets itself, in px: style={{ fontSize: 11 }} or '11px', a
 * fontSize={11} attribute, and Tailwind's text-[11px]. rem and em sizes
 * follow the page's, so they aren't counted. */
const componentSizes = components(src).flatMap(file => {
  const text = fs.readFileSync(file, 'utf8');
  const where = path.relative(src, file);
  const set = [...text.matchAll(/fontSize\s*[:=]\s*\{?\s*['"]?([\d.]+)([a-z%]*)/g)]
    .filter(m => m[2] === '' || m[2] === 'px')
    .map(m => ({ size: Number(m[1]), where, tag: tagStyle(around(text, m.index)) }));
  const tailwind = [...text.matchAll(/\btext-\[([\d.]+)px\]/g)].map(m => ({
    size: Number(m[1]), where, tag: /\buppercase\b|\btracking-(?:wide|wider|widest)\b/.test(around(text, m.index)),
  }));
  return [...set, ...tailwind];
});

const sheetSizes = SHEETS.flatMap(file => rules(read(file)).flatMap(rule => fontSizes([rule])
  .map(({ size, selector }) => ({ size, where: `${file} ${selector}`, tag: tagRule(rule.body) }))));

// Under 12px, only an 11px tag.
const tooSmall = ({ size, tag }) => size < 12 && !(size === 11 && tag);

describe('the text sizes', () => {
  it('are read from every stylesheet index.css loads, and from the components', () => {
    expect(SHEETS).toEqual(expect.arrayContaining(['global.css', 'candidate-theme.css', 'product-layer.css', 'studio.css']));
    expect(sheetSizes.length).toBeGreaterThan(300);
    expect(componentSizes.length).toBeGreaterThan(100);
  });

  it('are 11px or more in every stylesheet', () => {
    expect(sheetSizes.filter(({ size }) => size < 11)).toEqual([]);
  });

  it('are 11px or more in every component', () => {
    expect(componentSizes.filter(({ size }) => size < 11)).toEqual([]);
  });

  it('are 12px or more for details, in every stylesheet: 11px is for tags', () => {
    expect(sheetSizes.filter(tooSmall)).toEqual([]);
  });

  it('are 12px or more for details, in every component: 11px is for tags', () => {
    expect(componentSizes.filter(tooSmall)).toEqual([]);
  });

  // Working text is 14px: nothing sits between it and the details' 12px.
  const between = ({ size }) => size > 12 && size < 14;

  it('are 12px or 14px, never between, in every stylesheet', () => {
    expect(sheetSizes.filter(between)).toEqual([]);
  });

  it('are 12px or 14px, never between, in every component', () => {
    expect(componentSizes.filter(between)).toEqual([]);
  });
});
