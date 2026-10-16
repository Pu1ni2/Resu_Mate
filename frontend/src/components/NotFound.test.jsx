import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';

import NotFound from './NotFound';

/* The page for an address the app doesn't have: what happened, and the ways on
 * from there. */

const openedDirectly = () => render(
  <MemoryRouter initialEntries={['/no/such/page']}>
    <Routes><Route path="*" element={<NotFound />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  document.title = 'ResuMate AI | Multi-Agent Hiring Platform';
});

describe('the page for an unknown address', () => {
  it('says so, and lists the ways on', () => {
    openedDirectly();
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found.' })).toBeTruthy();
    expect(screen.getByText('There’s nothing at this address.')).toBeTruthy();
    const ways = within(screen.getByRole('list'));
    expect(ways.getAllByRole('link')).toHaveLength(3);
    expect(ways.getByRole('link', { name: 'ResuMate home' }).getAttribute('href')).toBe('/');
    expect(ways.getByRole('link', { name: 'Hiring manager sign-in' }).getAttribute('href')).toBe('/hiring/login');
    expect(ways.getByRole('link', { name: 'Candidate portal' }).getAttribute('href')).toBe('/candidate/login');
  });

  it('names the tab', () => {
    openedDirectly();
    expect(document.title).toBe('Page not found — ResuMate');
  });

  it('skips straight to the page', () => {
    openedDirectly();
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#page-content');
    expect(screen.getByRole('main').id).toBe('page-content');
  });

  it('leaves the keyboard alone when the address is opened directly', () => {
    openedDirectly();
    expect(document.activeElement).toBe(document.body);
  });

  it('gives the heading the keyboard when a link in the app led here', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Link to="/an/old/link">An old link</Link>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'An old link' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Page not found.' }));
  });
});
