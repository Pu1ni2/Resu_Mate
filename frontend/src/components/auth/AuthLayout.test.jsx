import React, { useState } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';

import AuthLayout, { FormHeading, StepHeading, SuccessPanel } from './AuthLayout';
import { JOURNEYS, SCREENS } from './authStories';

/* The sign-in pages' frame: each screen's story and journey, the switch between
 * the hiring and the candidate sign-in, and the way back home. */

const renderScreen = (name, path = '/hiring/login') => render(
  <MemoryRouter initialEntries={[path]}>
    <AuthLayout screen={name}><FormHeading screen={name} /></AuthLayout>
  </MemoryRouter>,
);

const href = name => screen.getByRole('link', { name }).getAttribute('href');

beforeEach(() => {
  document.title = 'ResuMate AI | Multi-Agent Hiring Platform';
});

describe('each screen', () => {
  it.each(Object.keys(SCREENS))('%s tells its own story, with its journey', (name) => {
    renderScreen(name);
    const { story, form, audience } = SCREENS[name];
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(story.title.join(''));
    expect(screen.getByText(story.copy)).toBeTruthy();
    expect(screen.getByText(story.caption)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: form.title })).toBeTruthy();
    const steps = within(screen.getByRole('list', { name: JOURNEYS[audience].name }));
    expect(steps.getAllByRole('heading', { level: 3 }).map(h => h.textContent))
      .toEqual(JOURNEYS[audience].steps.map(step => step.title));
    expect(document.title).toBe(`${form.title.replace(/\.$/, '')} — ResuMate`);
  });
});

describe('the switch between the two sign-ins', () => {
  it('marks the hiring side on the manager screens', () => {
    renderScreen('register', '/hiring/register');
    const hiring = screen.getByRole('link', { name: 'I’m hiring' });
    expect(hiring.getAttribute('href')).toBe('/hiring/login');
    expect(hiring.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'I’m a candidate' }).hasAttribute('aria-current')).toBe(false);
  });

  it('marks the candidate side on the candidate screens', () => {
    renderScreen('code', '/candidate/login');
    const candidate = screen.getByRole('link', { name: 'I’m a candidate' });
    expect(candidate.getAttribute('href')).toBe('/candidate/login');
    expect(candidate.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'I’m hiring' }).hasAttribute('aria-current')).toBe(false);
  });
});

describe('the frame', () => {
  it('leads home, to the legal pages, and skips straight to the form', () => {
    renderScreen('login');
    expect(href('ResuMate homepage')).toBe('/');
    expect(href('Back to the homepage')).toBe('/');
    expect(href('Privacy')).toBe('/privacy');
    expect(href('Terms')).toBe('/terms');
    expect(href('Skip to sign in')).toBe('#auth-content');
    expect(screen.getByText(`© ${new Date().getFullYear()} ResuMate`)).toBeTruthy();
    expect(screen.queryByText(/studio/i)).toBeNull();
  });
});

describe('the form heading', () => {
  it('leaves the keyboard alone when the page is opened directly', () => {
    renderScreen('login');
    expect(document.activeElement).toBe(document.body);
  });

  it('takes the keyboard when the page is reached from another page', () => {
    render(
      <MemoryRouter initialEntries={['/hiring/login']}>
        <Routes>
          <Route path="/hiring/login" element={<Link to="/hiring/forgot">Forgot password?</Link>} />
          <Route path="/hiring/forgot" element={<AuthLayout screen="forgot"><FormHeading screen="forgot" /></AuthLayout>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Forgot password?' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Forgot your password?' }));
  });

  it('takes the keyboard when the screen changes on the same page', () => {
    function Steps() {
      const [step, setStep] = useState('candidate');
      return (
        <AuthLayout screen={step}>
          <FormHeading screen={step} focusKey={step} />
          <button type="button" onClick={() => setStep('code')}>Next</button>
        </AuthLayout>
      );
    }
    render(<MemoryRouter initialEntries={['/candidate/login']}><Steps /></MemoryRouter>);
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Check your inbox.' }));
  });
});

describe('a heading on a page with no story beside the form', () => {
  it('is the page’s own heading', () => {
    render(
      <MemoryRouter>
        <StepHeading level={1} eyebrow="Privacy" title="Delete your data." intro="Ask us to delete it." />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Delete your data.' })).toBeTruthy();
    expect(screen.getByText('Privacy').className).toBe('form-eyebrow');
    expect(screen.getByText('Ask us to delete it.').className).toBe('form-intro');
  });

  it('so is the title of what replaces the form, under its own eyebrow', () => {
    render(
      <MemoryRouter>
        <SuccessPanel level={1} eyebrow="Privacy" title="Your data is deleted."><p>All of it.</p></SuccessPanel>
      </MemoryRouter>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Your data is deleted.' });
    expect(document.activeElement).toBe(title);
    expect(screen.getByText('Privacy')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('All of it.');
  });

  it('while a sign-in screen’s keeps the screen’s eyebrow, under the story', () => {
    render(<MemoryRouter><SuccessPanel screen="forgot" title="Check your inbox." /></MemoryRouter>);
    expect(screen.getByText(SCREENS.forgot.form.eyebrow)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Check your inbox.' })).toBeTruthy();
  });
});
