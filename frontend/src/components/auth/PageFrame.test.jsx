import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import PageFrame from './PageFrame';

/* The frame around every page in the sign-in design: the way home, the legal
 * links, a skip link to the page's own part, and the tab title. */

const BEFORE = 'ResuMate AI | Multi-Agent Hiring Platform';

const renderFrame = () => render(
  <MemoryRouter>
    <PageFrame title="Terms of Service — ResuMate" skipTo="page-content" skipLabel="Skip to content">
      <main id="page-content"><h1>Terms of Service</h1></main>
    </PageFrame>
  </MemoryRouter>,
);

const href = name => screen.getByRole('link', { name }).getAttribute('href');

beforeEach(() => {
  document.title = BEFORE;
});

describe('the page frame', () => {
  it('leads home and to the legal pages, around the page', () => {
    renderFrame();
    expect(href('ResuMate homepage')).toBe('/');
    expect(href('Back to the homepage')).toBe('/');
    expect(href('Privacy')).toBe('/privacy');
    expect(href('Terms')).toBe('/terms');
    expect(screen.getByText(`© ${new Date().getFullYear()} ResuMate`)).toBeTruthy();
    expect(screen.getByRole('main').textContent).toBe('Terms of Service');
  });

  it("skips to the page's own part", () => {
    renderFrame();
    expect(href('Skip to content')).toBe('#page-content');
  });

  it('names the tab after the page, and gives the name back on leaving', () => {
    const { unmount } = renderFrame();
    expect(document.title).toBe('Terms of Service — ResuMate');
    unmount();
    expect(document.title).toBe(BEFORE);
  });
});
