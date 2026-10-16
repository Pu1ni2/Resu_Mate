import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';

import { toast } from '../services/notify';
import ProductLayer from './ProductLayer';

/* Only the product's pages get the product chrome: not the homepage, the legal
 * pages, the sign-in pages, or an address the app doesn't have.
 * The keyboard shortcuts used to work there too: "t" flipped the dashboard's
 * saved theme for a visitor who never sees it, and "n" and "?" opened product
 * panels. Notices still show there, at the bottom: at the top they covered
 * "Sign in". And the first-time walkthrough opened over the sign-in form. */

const SIGN_IN = ['/hiring/login', '/hiring/register', '/hiring/forgot', '/hiring/reset', '/candidate/login'];
const WALKTHROUGH = 'Welcome to ResuMate AI!';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProductLayer><Link to="/">Home</Link></ProductLayer>
    </MemoryRouter>,
  );
}

const press = (key, extra = {}) => act(() => { fireEvent.keyDown(window, { key, ...extra }); });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('resumate_onboarded', 'true');
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  vi.useRealTimers();
});

describe('on the public pages', () => {
  it.each(['/', '/terms', '/privacy', '/privacy/delete', ...SIGN_IN])('%s shows no product toolbar', path => {
    renderAt(path);
    expect(screen.queryByRole('button', { name: 'Toggle theme' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull();
  });

  it('"t" leaves the saved theme alone', () => {
    renderAt('/');
    press('t');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('resumate_theme')).toBe('dark');
  });

  it('"n" and "?" open no panel', () => {
    renderAt('/');
    press('n');
    press('?', { shiftKey: true });
    expect(screen.queryByRole('button', { name: 'Close notifications' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close shortcuts' })).toBeNull();
  });

  it.each(['/', '/hiring/login'])('notices still show on %s, at the bottom', path => {
    renderAt(path);
    act(() => { toast('Starting the server.'); });
    const notices = screen.getByRole('status');
    expect(notices.textContent).toContain('Starting the server.');
    expect(notices.className.split(/\s+/)).toEqual(expect.arrayContaining(['top-auto', 'bottom-4']));
  });

  it.each(SIGN_IN.filter(path => path.startsWith('/hiring')))('%s opens no walkthrough for a first-time visitor', path => {
    localStorage.removeItem('resumate_onboarded');
    vi.useFakeTimers();
    renderAt(path);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText(WALKTHROUGH)).toBeNull();
  });
});

/* An unknown address got the toolbar: the public pages were a list, and it
 * was on none. */
describe('on an address the app does not have', () => {
  it.each(['/no/such/page', '/candidate', '/candidate/elsewhere', '/hiringx'])('%s shows no product toolbar', path => {
    renderAt(path);
    expect(screen.queryByRole('button', { name: 'Toggle theme' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull();
  });

  it('"t" leaves the saved theme alone', () => {
    renderAt('/no/such/page');
    press('t');
    expect(localStorage.getItem('resumate_theme')).toBe('dark');
  });
});

describe('on the product pages', () => {
  it.each(['/hiring', '/hiring/focus', '/hiring/sourcer', '/candidate/dashboard', '/candidate/dashboard/interview', '/dashboard'])(
    '%s shows the product toolbar', path => {
      renderAt(path);
      expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    },
  );

  it('the walkthrough still opens for a first-time visitor to the dashboard', () => {
    localStorage.removeItem('resumate_onboarded');
    vi.useFakeTimers();
    renderAt('/hiring');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(WALKTHROUGH)).toBeTruthy();
  });

  it('notices stay at the top, clear of the toolbar', () => {
    renderAt('/hiring');
    expect(screen.getByRole('status').className).toBe('pl-toast-container');
  });

  it('"t" still switches the theme', () => {
    renderAt('/hiring');
    press('t');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('resumate_theme')).toBe('light');
  });

  it('a panel left open does not follow you to the homepage', () => {
    renderAt('/hiring');
    press('n');
    expect(screen.getByRole('button', { name: 'Close notifications' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(screen.queryByRole('button', { name: 'Close notifications' })).toBeNull();
    press('t');
    expect(localStorage.getItem('resumate_theme')).toBe('dark');
  });
});

/* index.html paints the Studio pages cream before the app has run, and has
 * to tell them from the product's without the app's code: the same line. */
describe('the line between the product and the rest', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const paintedCream = (pathname) => {
    const attributes = {};
    const page = { documentElement: { setAttribute: (name, value) => { attributes[name] = value; } } };
    new Function('location', 'document', script)({ pathname }, page);
    return attributes['data-boot'] === 'studio';
  };

  it.each([
    '/', '/terms', '/privacy/delete', '/hiring/login', '/hiring/reset', '/candidate/login', '/no/such/page',
    '/hiring', '/hiring/focus', '/candidate/dashboard', '/dashboard',
  ])('is where index.html draws it, at %s', (pathname) => {
    renderAt(pathname);
    const product = !!screen.queryByRole('button', { name: 'Toggle theme' });
    expect(paintedCream(pathname)).toBe(!product);
  });
});
