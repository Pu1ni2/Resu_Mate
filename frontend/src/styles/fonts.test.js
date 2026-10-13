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

describe('the fonts', () => {
  it('come from the app, not from Google', () => {
    expect(read('index.html')).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
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
