import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Landing from './Landing';

/* Tailwind is loaded without its preflight reset (styles/index.css), so a
 * <button> keeps the browser's grey background and bevelled border unless its
 * classes set both. On the home page the logo was a grey box with near-white
 * text, "Open dashboard" had a bevelled border and "Candidate portal" a grey
 * fill. */

const setsBackground = classes => classes.some(c => /^bg-/.test(c));
const setsBorder = classes => classes.some(c => /^border(-0|-2|-4|-8)?$/.test(c) || /^border-\[\d/.test(c));

function renderLanding() {
  return render(<MemoryRouter><Landing /></MemoryRouter>);
}

describe('the home page buttons', () => {
  it('each set their own background and border', () => {
    renderLanding();
    const unstyled = screen.getAllByRole('button')
      .filter(button => {
        const classes = (button.getAttribute('class') || '').split(/\s+/);
        // The legacy stylesheet (landing.css, "l-" classes) styles its own.
        if (classes.some(c => c.startsWith('l-'))) return false;
        return !(setsBackground(classes) && setsBorder(classes));
      })
      .map(button => button.textContent.trim() || button.getAttribute('aria-label'));
    expect(unstyled).toEqual([]);
  });

  it('show the logo as the mark and the name, not in a grey box', () => {
    renderLanding();
    const logo = screen.getAllByRole('button').find(button => button.textContent.trim() === 'ResuMateAI');
    expect(logo.className.split(/\s+/)).toEqual(expect.arrayContaining(['bg-transparent', 'border-0']));
  });
});
