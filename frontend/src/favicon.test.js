import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/* The tab's icon is the brand's: the rust mark beside the name on every page,
 * where it used to be the old amber hexagon. */

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');

describe('the favicon', () => {
  const icon = read('public/favicon.svg');

  it('is the one the page links to', () => {
    expect(read('index.html')).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/);
  });

  it("is the mark's two bars, in the theme's brand rust on its cream", () => {
    const brand = /--color-brand:\s*(#[0-9a-f]{6})/i.exec(read('src/styles/theme.css'))[1];
    const canvas = /--color-canvas:\s*(#[0-9a-f]{6})/i.exec(read('src/styles/theme.css'))[1];
    expect(icon).toContain(`fill="${brand}"`);
    expect(icon).toContain(`fill="${canvas}"`);
    expect(icon.match(/rotate\(-?28 /g)).toHaveLength(2);
    expect(icon).not.toMatch(/#F59E0B|#D97706/i);
  });
});
