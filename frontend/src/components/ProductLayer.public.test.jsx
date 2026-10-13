import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';

import { toast } from '../services/notify';
import ProductLayer from './ProductLayer';

/* The homepage and the legal pages get no product chrome. The keyboard
 * shortcuts used to work there too: "t" flipped the dashboard's saved theme for
 * a visitor who never sees it, and "n" and "?" opened product panels. Notices
 * still show there, at the bottom: at the top they covered "Sign in". */

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
});

describe('on the public pages', () => {
  it.each(['/', '/terms', '/privacy', '/privacy/delete'])('%s shows no product toolbar', path => {
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

  it('notices still show, at the bottom', () => {
    renderAt('/');
    act(() => { toast('Starting the server.'); });
    const notices = screen.getByRole('status');
    expect(notices.textContent).toContain('Starting the server.');
    expect(notices.className.split(/\s+/)).toEqual(expect.arrayContaining(['top-auto', 'bottom-4']));
  });
});

describe('on the product pages', () => {
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
