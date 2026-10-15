// Reading the stylesheets in Node, for the tests that guard them: jsdom loads
// no CSS, so a test that cares about a rule has to read the file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';

const styles = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(styles, '../..');

export const read = file => fs.readFileSync(path.join(styles, file), 'utf8');

/** Every rule as { media, selector, body }, one @media level deep. */
export function rules(css, media = '') {
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

export const declarations = body => Object.fromEntries(body.split(';')
  .map(d => d.split(':'))
  .filter(parts => parts.length > 1)
  .map(([prop, ...value]) => [prop.trim(), value.join(':').trim()]));

export const classesIn = selector => [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]);

/** A selector list's selectors: its commas outside :where(…) and the like. */
export function selectorsIn(list) {
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

/** Every class name the legacy stylesheets style, as index.css loads them. */
export function legacyClasses() {
  const legacy = [...read('index.css').matchAll(/@import '\.\/([\w-]+\.css)' layer\(legacy\)/g)].map(m => m[1]);
  return { files: legacy, names: new Set(legacy.flatMap(file => rules(read(file)).flatMap(r => classesIn(r.selector)))) };
}

/** Does Tailwind, with the project's theme, turn this class name into a utility? */
export async function tailwindUtility() {
  const tailwind = path.join(frontend, 'node_modules/tailwindcss');
  const compiler = await compile("@import 'tailwindcss/theme.css'; @import './src/styles/theme.css'; @tailwind utilities;", {
    base: frontend,
    loadStylesheet: async (id, base) => {
      const file = id.startsWith('tailwindcss/') ? path.join(tailwind, id.slice('tailwindcss/'.length)) : path.resolve(base, id);
      return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
    },
  });
  return name => new RegExp(`\\.${name}(?![\\w-])`).test(compiler.build([name]));
}

/** Every font size a set of rules sets, in px, with the selector that sets it. */
export const fontSizes = list => list.flatMap(({ selector, body }) => {
  const d = declarations(body);
  const px = [...(d['font-size'] || '').matchAll(/([\d.]+)px/g)].map(m => Number(m[1]));
  const shorthand = (d.font || '').match(/([\d.]+)px/);
  if (shorthand) px.push(Number(shorthand[1]));
  return px.map(size => ({ size, selector }));
});
