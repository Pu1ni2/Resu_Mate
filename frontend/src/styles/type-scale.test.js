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

/* What a component sets itself, in px: style={{ fontSize: 11 }} or '11px', a
 * fontSize={11} attribute, and Tailwind's text-[11px]. rem and em sizes
 * follow the page's, so they aren't counted. */
const componentSizes = components(src).flatMap(file => {
  const text = fs.readFileSync(file, 'utf8');
  const where = path.relative(src, file);
  const set = [...text.matchAll(/fontSize\s*[:=]\s*\{?\s*['"]?([\d.]+)([a-z%]*)/g)]
    .filter(m => m[2] === '' || m[2] === 'px')
    .map(m => ({ size: Number(m[1]), where }));
  const tailwind = [...text.matchAll(/\btext-\[([\d.]+)px\]/g)].map(m => ({ size: Number(m[1]), where }));
  return [...set, ...tailwind];
});

const sheetSizes = SHEETS.flatMap(file => fontSizes(rules(read(file))).map(({ size, selector }) => ({ size, where: `${file} ${selector}` })));

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
});
