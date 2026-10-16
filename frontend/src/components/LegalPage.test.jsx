import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { TermsPage, PrivacyPage } from './LegalPage';
import PageFrame from './auth/PageFrame';

/* The Terms of Service and the Privacy Policy: the title, the date, the
 * placeholder notice, and the sections in order, numbered for the eye only. */

const TERMS = [
  'Acceptance of terms', 'Use of the service', 'Accounts', 'Acceptable use', 'AI-generated content',
  'Limitation of liability', 'Changes',
];
const PRIVACY = [
  'What we collect', 'How we use it', 'Data isolation', 'Candidate rights', 'Public profiles (Find candidates)',
  'Retention', 'Sub-processors', 'Contact', 'Deleting your data',
];

const open = page => render(<MemoryRouter>{page}</MemoryRouter>);
const sectionTitles = () => screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);

beforeEach(() => {
  document.title = 'ResuMate AI | Multi-Agent Hiring Platform';
});

describe.each([
  ['Terms of Service', <TermsPage key="terms" />, TERMS],
  ['Privacy Policy', <PrivacyPage key="privacy" />, PRIVACY],
])('the %s', (title, page, sections) => {
  it('has its title, its date and the placeholder notice', () => {
    open(page);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
    expect(screen.getByText('Last updated: June 2026')).toBeTruthy();
    expect(screen.getByText('Placeholder text — replace with reviewed legal copy before launch.')).toBeTruthy();
    expect(document.title).toBe(`${title} — ResuMate`);
  });

  it('has its sections in order, numbered for the eye only', () => {
    open(page);
    expect(sectionTitles()).toEqual(sections);
    const first = screen.getByRole('heading', { level: 2, name: sections[0] }).closest('section');
    const number = within(first).getByText('01 /');
    expect(number.getAttribute('aria-hidden')).toBe('true');
  });

  it('skips straight to the text', () => {
    open(page);
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#page-content');
    expect(screen.getByRole('main').id).toBe('page-content');
  });
});

describe('the Privacy Policy', () => {
  it('ends with the way to have data deleted', () => {
    open(<PrivacyPage />);
    const last = screen.getByRole('heading', { level: 2, name: 'Deleting your data' }).closest('section');
    expect(within(last).getByRole('link', { name: 'request deletion' }).getAttribute('href')).toBe('/privacy/delete');
  });
});

describe('arriving from another page', () => {
  it('puts the keyboard on the title, from the footer of a page in the same design', () => {
    render(
      <MemoryRouter initialEntries={['/elsewhere']}>
        <Routes>
          <Route path="/elsewhere" element={<PageFrame title="Elsewhere" skipTo="x" skipLabel="Skip"><main id="x" /></PageFrame>} />
          <Route path="/terms" element={<TermsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Terms' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Terms of Service' }));
  });

  it('but leaves it alone when the page is opened directly', () => {
    open(<TermsPage />);
    expect(document.activeElement).toBe(document.body);
  });
});
