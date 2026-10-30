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
 * The keyboard shortcuts used to work there too: "n" and "?" opened product
 * panels. Notices still show there, at the bottom: at the top they covered
 * "Sign in". And the first-time walkthrough opened over the sign-in form. */

const SIGN_IN = ['/hiring/login', '/hiring/register', '/hiring/forgot', '/hiring/reset', '/candidate/login'];
const WALKTHROUGH = 'Welcome to your hiring desk.';

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
    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).toBeNull();
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
    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).toBeNull();
  });

  it('"n" and "?" open no panel', () => {
    renderAt('/no/such/page');
    press('n');
    press('?', { shiftKey: true });
    expect(screen.queryByRole('button', { name: 'Close notifications' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close shortcuts' })).toBeNull();
  });
});

describe('on the product pages', () => {
  it.each(['/hiring', '/hiring/focus', '/hiring/sourcer', '/candidate/dashboard', '/candidate/dashboard/interview', '/dashboard'])(
    '%s shows the product toolbar', path => {
      renderAt(path);
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeTruthy();
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

  it('has one light theme: no switch, no "t", and an old saved choice forgotten', () => {
    localStorage.setItem('resumate_theme', 'dark');
    renderAt('/hiring');
    expect(screen.queryByRole('button', { name: 'Toggle theme' })).toBeNull();
    press('t');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('resumate_theme')).toBeNull();
  });

  it('a panel left open does not follow you to the homepage', () => {
    renderAt('/hiring');
    press('n');
    expect(screen.getByRole('button', { name: 'Close notifications' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(screen.queryByRole('button', { name: 'Close notifications' })).toBeNull();
    // and its shortcut is off there too
    press('n');
    expect(screen.queryByRole('button', { name: 'Close notifications' })).toBeNull();
  });
});

/* Every page is cream, so index.html paints each one cream before the app has
 * run, and sets the light theme before anything reads it. */
describe('before the app starts', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const marks = (pathname) => {
    const attributes = {};
    const page = { documentElement: { setAttribute: (name, value) => { attributes[name] = value; } } };
    new Function('location', 'document', script)({ pathname }, page);
    return attributes;
  };

  it.each(['/', '/hiring/login', '/no/such/page', '/hiring', '/hiring/focus', '/candidate/dashboard'])(
    '%s is painted cream, in the light theme', (pathname) => {
      expect(marks(pathname)).toEqual({ 'data-boot': 'studio', 'data-theme': 'light' });
    },
  );

  it("and the phone's browser bar starts cream", () => {
    expect(html).toContain('<meta name="theme-color" content="#f6f3eb">');
  });
});
