// @vitest-environment node
// (it reads files only, and the build config's plugins don't load under jsdom)
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import viteConfig from '../../vite.config.js';

/* The fonts ship with the app (main.jsx). A font that fails to load falls back
 * to the system font without a word: Google's link failed that way for months.
 * A package that registers another family name would fail the same way, as
 * @fontsource's variable packages do ("DM Sans Variable"). */

const frontend = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');

// Every family a font file registers.
const familiesIn = file => [...new Set([...read(file).matchAll(/font-family:\s*'([^']+)'/g)].map(m => m[1]))];

// The first family a token asks for, e.g. 'DM Sans' from --font-sans.
const firstFamily = (css, token) => css.match(new RegExp(`${token}:\\s*'([^']+)'`))?.[1];

const FONTS = [
  { pkg: '@fontsource/dm-sans', files: ['400', '500', '600', '700'], token: '--font-sans' },
  { pkg: '@fontsource/jetbrains-mono', files: ['400', '500', '600', '700'], token: '--font-mono' },
  { pkg: '@fontsource/instrument-serif', files: ['400', '400-italic'], family: 'Instrument Serif' },
];

const stylesheets = fs.readdirSync(path.join(frontend, 'src/styles')).filter(f => f.endsWith('.css'));
const GENERIC = ['inherit', 'initial', 'unset', 'monospace', 'sans-serif', 'serif', 'system-ui', 'ui-monospace'];

describe('the fonts', () => {
  it('come from the app, not from a font site', () => {
    expect(read('index.html')).not.toMatch(/<link[^>]+href="https?:\/\//);
    for (const sheet of stylesheets) {
      expect(read(`src/styles/${sheet}`)).not.toMatch(/@import\s+(url\()?\s*['"]?https?:|url\(\s*['"]?https?:[^)]*\.(woff2?|ttf|otf)/);
    }
  });

  it('are the ones every font list in the stylesheets asks for first', () => {
    // A family the app doesn't ship falls back without a word, as Satoshi,
    // Fraunces and DM Mono did.
    const bundled = new Set(FONTS.map(({ pkg, files }) => familiesIn(`node_modules/${pkg}/${files[0]}.css`)[0]));
    const lists = stylesheets.flatMap(sheet => [
      ...read(`src/styles/${sheet}`).matchAll(/(?:font-family|--font-[a-z]+|--sans|--serif)\s*:\s*([^;}]+)/g),
    ].map(m => ({ sheet, first: m[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '') })));
    expect(lists.length).toBeGreaterThan(20);
    const unshipped = lists.filter(({ first }) => !first.startsWith('var(') && !GENERIC.includes(first) && !bundled.has(first));
    expect(unshipped).toEqual([]);
  });

  it('are imported in every weight the pages use', () => {
    const main = read('src/main.jsx');
    for (const { pkg, files } of FONTS) {
      for (const file of files) expect(main).toContain(`import '${pkg}/${file}.css'`);
    }
  });

  it('register the families the stylesheets ask for', () => {
    for (const sheet of ['src/styles/theme.css', 'src/styles/design-system.css']) {
      const css = read(sheet);
      for (const { pkg, files, token, family } of FONTS) {
        const wanted = token ? firstFamily(css, token) : family;
        expect(wanted).toBeTruthy();
        for (const file of files) expect(familiesIn(`node_modules/${pkg}/${file}.css`)).toEqual([wanted]);
      }
    }
  });

  it('stay separate files, never inlined into the stylesheet', () => {
    const inline = viteConfig.build.assetsInlineLimit;
    expect(inline('/x/node_modules/@fontsource/dm-sans/files/dm-sans-latin-ext-400-normal.woff2')).toBe(false);
    expect(inline('/x/node_modules/@fontsource/dm-sans/files/dm-sans-latin-ext-400-normal.woff')).toBe(false);
    expect(inline('/x/src/assets/logo.svg')).toBeUndefined();
  });
});
