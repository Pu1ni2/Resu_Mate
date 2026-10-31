import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { read, rules, selectorsIn } from './cssForTests';

/* The app is always in its light theme, so rules for a dark one are never
 * reached; nor are rules for the old dark scanning screen, which nothing
 * renders. They were removed, and these keep them from coming back. */

const styles = path.dirname(fileURLToPath(import.meta.url));
const sheets = fs.readdirSync(styles).filter(file => file.endsWith('.css'));
const matching = test => sheets.flatMap(file => rules(read(file))
  .flatMap(r => selectorsIn(r.selector).filter(test).map(s => `${file}: ${s}`)));

describe('the stylesheets', () => {
  it('have no rules for a dark theme', () => {
    expect(sheets.length).toBeGreaterThan(10);
    expect(matching(s => /data-theme\s*=\s*["']?dark/.test(s))).toEqual([]);
  });

  it('style nothing of the old dark scanning screen', () => {
    expect(matching(s => /\.(scanner-terminal|scanner-fullscreen|matrix-canvas)(?![\w-])/.test(s))).toEqual([]);
  });

  it("still give the candidate portal's page its colours", () => {
    expect(rules(read('overrides.css')).some(r => selectorsIn(r.selector).includes('.cd-layout') && /background\s*:/.test(r.body))).toBe(true);
  });
});

describe('the theme', () => {
  it('is light from the first paint, and stays light', () => {
    const frontend = path.resolve(styles, '../..');
    expect(fs.readFileSync(path.join(frontend, 'index.html'), 'utf8')).toMatch(/setAttribute\('data-theme', 'light'\)/);
    const layer = fs.readFileSync(path.join(frontend, 'src/components/ProductLayer.jsx'), 'utf8');
    expect(layer).toMatch(/setAttribute\('data-theme', 'light'\)/);
    expect(layer).not.toMatch(/setAttribute\('data-theme', ['"]dark/);
  });
});
