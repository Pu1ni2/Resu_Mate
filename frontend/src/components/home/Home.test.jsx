import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { TOKEN_KEY } from '../../services/session';
import Home from './Home';

/* The homepage, in the Studio design. Its wording is the approved design's, its
 * links lead into the app, and the candidate file and the preview below it
 * always show the same made-up person. */

let scrollIntoView;

beforeEach(() => {
  localStorage.clear();
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  delete window.matchMedia;
  vi.restoreAllMocks();
});

const renderHome = () => render(<MemoryRouter><Home /></MemoryRouter>);
const href = name => screen.getByRole('link', { name }).getAttribute('href');
const file = () => screen.getByRole('group', { name: 'A sample candidate file' });
const tab = name => screen.getByRole('tab', { name });
const announced = () => screen.getByText((_, el) => el?.matches('.sr-only[role="status"]')).textContent;

/** A matchMedia that matches only the given queries. */
function matching(...queries) {
  window.matchMedia = vi.fn(query => ({
    media: query, matches: queries.includes(query), addEventListener() {}, removeEventListener() {},
  }));
}

describe('the wording', () => {
  it("is the approved design's, accents and all", () => {
    renderHome();
    expect(screen.getAllByRole('heading').map(h => h.textContent)).toEqual([
      'See the person.Find the fit.',
      'Alex Kim',
      'Less busywork.More understanding.',
      'Read between the lines.',
      'Go beyond the résumé.',
      'Make a considered call.',
      'One flow. A clearer picture.',
      'Your next great hire.',
      'Your next great hirehas a story to tell.',
    ]);
    expect(screen.getByText('Read every résumé. Interview the best three.')).toBeTruthy();
    expect(screen.getByText('Great people are more than a page. Connect résumé screening, AI interviews, and deeper insights in one hiring workspace.')).toBeTruthy();
    expect(screen.getByText('AI brings the insight. You make the call.')).toBeTruthy();
    expect(screen.getByText('Take another look. A different perspective might be the beginning of something great.')).toBeTruthy();
  });

  it('says the people are made up', () => {
    renderHome();
    expect(within(file()).getByText('FICTIONAL PROFILE · DEMO ONLY')).toBeTruthy();
    expect(screen.getByText('An illustrative preview with fictional candidates. No résumés are uploaded and no interviews are started.')).toBeTruthy();
  });
});

describe('the links', () => {
  it('lead into the app', () => {
    renderHome();
    expect(href('Sign in')).toBe('/hiring/login');
    expect(href('Start hiring')).toBe('/hiring/register');
    expect(href('or start hiring')).toBe('/hiring/register');
    expect(href('Candidate login')).toBe('/candidate/login');
    expect(href("I'm a candidate")).toBe('/candidate/login');
    expect(href('Terms')).toBe('/terms');
    expect(href('Privacy')).toBe('/privacy');
    expect(href('Delete my data')).toBe('/privacy/delete');
  });

  it('take a manager who is signed in straight to the dashboard', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt');
    renderHome();
    expect(href('Sign in')).toBe('/hiring');
    expect(href('Start hiring')).toBe('/hiring');
    expect(href('or start hiring')).toBe('/hiring');
    expect(href('Candidate login')).toBe('/candidate/login');
  });

  it('move around the page', () => {
    renderHome();
    expect(href('ResuMate home')).toBe('#top');
    expect(document.getElementById('top').classList.contains('studio')).toBe(true);
    // The menu's opens the page; the hero's scrolls to the three steps.
    expect(screen.getAllByRole('link', { name: 'How it works' }).map(a => a.getAttribute('href'))).toEqual(['/how-it-works', '#how']);
    expect(href('Meet the next sample candidate')).toBe('#candidate-file');
  });
});

describe('the candidate file and the preview', () => {
  it('show the person chosen, and say who it is', () => {
    renderHome();
    expect(within(file()).getByText('01 / 03')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Jordan L.' }));

    expect(screen.getByRole('button', { name: 'Jordan L.' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Alex K.' }).getAttribute('aria-pressed')).toBe('false');
    const sheet = within(file());
    expect(sheet.getByText('Jordan Lee')).toBeTruthy();
    expect(sheet.getByText('Software engineer · 5 years')).toBeTruthy();
    expect(sheet.getByText('Cloud systems')).toBeTruthy();
    expect(sheet.getByText('Ask Jordan what makes a service maintainable as the team grows.')).toBeTruthy();
    expect(sheet.getByText('02 / 03')).toBeTruthy();
    expect(announced()).toBe('Showing sample profile: Jordan Lee, Software engineer · 5 years.');

    fireEvent.click(tab('Interview'));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('Jordan Lee')).toBeTruthy();
    expect(within(panel).getByText('“Tell us about an architectural decision you revisited as your system grew.”')).toBeTruthy();
    expect(announced()).toBe('Interview preview: Jordan Lee.');
  });

  it('go round to the first person after the last', () => {
    renderHome();
    const next = screen.getByRole('link', { name: 'Meet the next sample candidate' });
    fireEvent.click(next);
    expect(within(file()).getByText('Jordan Lee')).toBeTruthy();
    fireEvent.click(next);
    fireEvent.click(next);
    expect(within(file()).getByText('Alex Kim')).toBeTruthy();
    expect(within(file()).getByText('01 / 03')).toBeTruthy();
  });

  it("ask the person's question first, then the two anyone gets, and round again", () => {
    renderHome();
    fireEvent.click(tab('Interview'));
    const panel = () => within(screen.getByRole('tabpanel'));
    expect(panel().getByText('Question 1 of 3')).toBeTruthy();
    fireEvent.click(panel().getByRole('button', { name: 'Next sample question' }));
    expect(panel().getByText('Question 2 of 3')).toBeTruthy();
    expect(panel().getByText('“Walk me through a hard problem you solved. How did you know your solution worked?”')).toBeTruthy();
    fireEvent.click(panel().getByRole('button', { name: 'Next sample question' }));
    fireEvent.click(panel().getByRole('button', { name: 'Next sample question' }));
    expect(panel().getByText('Question 1 of 3')).toBeTruthy();
  });
});

describe('the preview tabs', () => {
  it('are one tab stop, each paired with its panel, with one panel showing', () => {
    renderHome();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['01Screen↗', '02Interview↗', '03Evaluate↗', '04Candidate portal↗']);
    expect(tabs.filter(t => t.tabIndex === 0)).toEqual([tab('Screen')]);
    for (const t of tabs) {
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      expect(panel.getAttribute('aria-labelledby')).toBe(t.id);
    }
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('tab-screen');
  });

  it('move with the arrow keys, Home and End, going round at either end', () => {
    renderHome();
    const press = key => fireEvent.keyDown(document.activeElement, { key });
    tab('Screen').focus();
    const now = () => [document.activeElement.textContent, screen.getByRole('tab', { selected: true }).textContent];

    press('ArrowDown');
    expect(now()).toEqual(['02Interview↗', '02Interview↗']);
    press('ArrowRight');
    expect(now()[1]).toBe('03Evaluate↗');
    press('ArrowUp');
    expect(now()[1]).toBe('02Interview↗');
    press('End');
    expect(now()).toEqual(['04Candidate portal↗', '04Candidate portal↗']);
    press('ArrowDown');
    expect(now()[1]).toBe('01Screen↗');
    press('ArrowLeft');
    expect(now()[1]).toBe('04Candidate portal↗');
    press('Home');
    expect(now()[1]).toBe('01Screen↗');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('tab-screen');
  });

  it('run down the page on a wide screen and across it below 1100px', () => {
    renderHome();
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe('vertical');
  });

  it('say so on a narrow screen', () => {
    matching('(max-width: 1100px)');
    renderHome();
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe('horizontal');
  });
});

describe('the buttons inside the preview', () => {
  it('"View" opens that person on Evaluate, with the keyboard on its tab', () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: "View Jordan Lee's sample profile" }));
    expect(document.activeElement).toBe(tab('Evaluate'));
    expect(tab('Evaluate').getAttribute('aria-selected')).toBe('true');
    expect(within(screen.getByRole('tabpanel')).getByText('Jordan Lee')).toBeTruthy();
    expect(within(file()).getByText('Jordan Lee')).toBeTruthy();
    expect(announced()).toBe('Evaluate preview: Jordan Lee.');
  });

  it('"Interview" on Evaluate opens Interview, with the keyboard on its tab', () => {
    renderHome();
    fireEvent.click(tab('Evaluate'));
    fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Interview' }));
    expect(document.activeElement).toBe(tab('Interview'));
    expect(tab('Interview').getAttribute('aria-selected')).toBe('true');
  });

  it('"Preview the interview" opens Interview and brings the preview into view', () => {
    renderHome();
    fireEvent.click(tab('Candidate portal'));
    fireEvent.click(screen.getByRole('link', { name: 'Preview the interview' }));
    expect(document.activeElement).toBe(tab('Interview'));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(scrollIntoView.mock.contexts.at(-1).id).toBe('platform');
  });
});

describe('the menu', () => {
  it('opens the preview on Screen for Platform, and on the portal for candidates', () => {
    renderHome();
    fireEvent.click(tab('Interview'));
    fireEvent.click(screen.getByRole('link', { name: 'Platform' }));
    expect(tab('Screen').getAttribute('aria-selected')).toBe('true');
    expect(scrollIntoView.mock.contexts.at(-1).id).toBe('platform');
    fireEvent.click(screen.getByRole('link', { name: 'For candidates' }));
    expect(tab('Candidate portal').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Candidate portal'));
  });

  it('jumps instead of gliding when motion is off', () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Motion: on' }));
    fireEvent.click(screen.getByRole('link', { name: 'Platform' }));
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'start' });
  });
});

describe('the motion switch', () => {
  it('stops and restarts the page\'s motion, and says which', () => {
    const { container } = renderHome();
    const page = container.firstChild;
    const button = screen.getByRole('button', { name: 'Motion: on' });
    expect(button.hasAttribute('aria-pressed')).toBe(false);
    expect(page.classList.contains('motion-paused')).toBe(false);
    fireEvent.click(button);
    expect(button.textContent).toBe('Motion: off');
    expect(page.classList.contains('motion-paused')).toBe(true);
    fireEvent.click(button);
    expect(button.textContent).toBe('Motion: on');
    expect(page.classList.contains('motion-paused')).toBe(false);
  });

  it("gives way to the computer's reduced-motion setting, and says so", () => {
    matching('(prefers-reduced-motion: reduce)');
    const { container } = renderHome();
    const button = screen.getByRole('button', { name: 'Motion: off (your setting)' });
    expect(button.disabled).toBe(true);
    expect(container.firstChild.classList.contains('motion-paused')).toBe(true);
  });
});

describe('the tab title and the browser bar', () => {
  it("are the design's while the homepage is open, and go back after", () => {
    const bar = document.createElement('meta');
    bar.setAttribute('name', 'theme-color');
    bar.setAttribute('content', '#09090B');
    document.head.appendChild(bar);
    document.title = 'ResuMate AI | Multi-Agent Hiring Platform';
    try {
      const { unmount } = renderHome();
      expect(document.title).toBe('ResuMate — See the person. Find the fit.');
      expect(bar.getAttribute('content')).toBe('#f6f3eb');
      unmount();
      expect(document.title).toBe('ResuMate AI | Multi-Agent Hiring Platform');
      expect(bar.getAttribute('content')).toBe('#09090B');
    } finally {
      bar.remove();
    }
  });
});

describe('every button on the page', () => {
  /* Tailwind runs without its preflight reset, so a button keeps the browser's
   * grey box unless a stylesheet styles it. Here studio.css does: each button
   * is inside .studio and has a class that studio.css styles. */
  it('is styled by the Studio stylesheet', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../styles/studio.css'), 'utf8');
    const styled = new Set([...css.matchAll(/\.([a-z][\w-]*)/g)].map(m => m[1]));
    renderHome();
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(10);
    const unstyled = [...buttons]
      .filter(button => !button.closest('.studio') || ![...button.classList].some(c => styled.has(c)))
      .map(button => button.textContent);
    expect(unstyled).toEqual([]);
  });
});
