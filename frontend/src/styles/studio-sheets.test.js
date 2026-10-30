// @vitest-environment node
// (it reads stylesheets only, and Tailwind's compiler runs in Node)
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { read, rules, classesIn, selectorsIn, legacyClasses, tailwindUtility, fontSizes } from './cssForTests';

/* Every Studio stylesheet, held to the same rules. Each page's stylesheet is
 * loaded once, from index.css, in the components layer, above the legacy
 * stylesheets and below Tailwind's utilities. A stylesheet imported from a
 * component isn't in that layer, so it either loses to every utility or beats
 * every layered rule, and arrives only when its page first opens.
 *
 * Each one is listed here: the root classes its rules sit under (a rule may
 * also reach the whole page while a root is on it, as html:has(.root)), the
 * prefix of its animation names, which are global, and the legacy class names
 * it deliberately restyles inside its root while the page still uses them. A
 * `decorative` sheet draws a picture with nothing in it to focus, so it needs
 * no focus ring of its own. */
const SHEETS = {
  'studio.css': { roots: ['studio'], keyframes: 'studio-' },
  'studio-auth.css': { roots: ['studio-auth'], keyframes: 'studio-auth-' },
  'studio-workspace.css': {
    roots: ['studio-workspace'],
    keyframes: 'studio-workspace-',
    restyles: [
      'btn', 'btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger', 'input',
      'glass-card', 'clean-card', 'card', 'clean-section-title', 'clean-stat-card', 'clean-stat-value',
      'clean-stat-icon', 'clean-bar-track', 'clean-bar-fill', 'clean-pill', 'clean-list-row',
      'chat-container', 'chat-header', 'chat-input-area', 'message', 'assistant', 'user',
      'message-content', 'suggestion',
    ],
  },
  'studio-interview.css': { roots: ['studio-interview-report'], keyframes: 'studio-interview-' },
  'studio-dashboard.css': {
    roots: ['studio-dashboard'],
    keyframes: 'studio-dashboard-',
    restyles: [
      'clean-bar-track', 'clean-bar-fill',
      'upload-tab', 'upload-card', 'card-body', 'upload-zone', 'active', 'upload-icon',
      'candidates-header', 'candidates-actions', 'btn', 'candidates-slider', 'slider-track',
      'candidate-card', 'selected', 'candidate-select', 'candidate-header', 'candidate-avatar',
      'candidate-name', 'candidate-role', 'candidate-stats', 'candidate-location', 'candidate-skills',
      'skill', 'candidate-badges', 'delete-btn', 'selected-check',
    ],
  },
  'studio-conversation.css': { roots: ['sc-conversation'], keyframes: 'studio-conversation-', decorative: true },
};

/* Does a selector start at one of these roots: the class itself, not a longer
 * name that begins with it, on its own or inside html:has(…)? */
const underRoot = (selector, roots) => roots.some(root => new RegExp(`^(html:has\\()?\\.${root}(?![\\w-])`).test(selector));

const src = path.resolve(__dirname, '..');
const loaded = [...read('index.css').matchAll(/@import '\.\/(studio[\w-]*\.css)' layer\(components\);/g)].map(m => m[1]);

const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return sourceFiles(full);
  return /\.(jsx?|tsx?)$/.test(entry.name) ? [full] : [];
});

describe('the Studio stylesheets', () => {
  it('are each listed here, and each loaded from index.css in the components layer', () => {
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.sort()).toEqual(Object.keys(SHEETS).sort());
  });

  it('are imported from no component', () => {
    const direct = sourceFiles(src).filter(file => /import\s+['"][^'"]*styles\/studio[\w-]*\.css['"]/.test(fs.readFileSync(file, 'utf8')));
    expect(direct.map(file => path.relative(src, file))).toEqual([]);
  });
});

describe.each(Object.entries(SHEETS))('%s', (file, { roots, keyframes, restyles = [], decorative = false }) => {
  const css = read(file);
  const list = rules(css);
  const selectors = list.flatMap(r => selectorsIn(r.selector));
  const classes = [...new Set(list.flatMap(r => classesIn(r.selector)))];

  it('puts itself in no layer (index.css does)', () => {
    expect(css).not.toMatch(/@layer\b/);
  });

  it('reaches nothing outside its own page', () => {
    expect(selectors.filter(s => !underRoot(s, roots))).toEqual([]);
  });

  it('shares no class name with the legacy stylesheets, apart from the ones it restyles', () => {
    const legacy = legacyClasses().names;
    expect(classes.filter(name => legacy.has(name) && !restyles.includes(name))).toEqual([]);
  });

  it('uses no class name Tailwind makes a utility of', async () => {
    const generates = await tailwindUtility();
    expect(classes.filter(generates)).toEqual([]);
  });

  it('sets no text smaller than 11px', () => {
    expect(fontSizes(list).filter(({ size }) => size < 11)).toEqual([]);
  });

  it('names its animations with its prefix, as keyframe names are global', () => {
    const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]);
    expect(names.filter(name => !name.startsWith(keyframes))).toEqual([]);
  });

  it.skipIf(decorative)('shows the keyboard where it is', () => {
    expect(selectors.some(s => s.includes(':focus-visible'))).toBe(true);
  });

  it('keeps still for someone who asks for less motion, if it moves', () => {
    const moves = /@keyframes|\banimation\s*:|\btransition\s*:/.test(css);
    if (moves) expect(css).toMatch(/prefers-reduced-motion/);
  });
});
