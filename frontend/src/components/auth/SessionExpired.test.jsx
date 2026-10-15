import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../../context/AppContext';
import App from '../../App';

/* When the server signed a manager out, the app went back to the sign-in page
 * without a word. It now says why; arriving signed out says nothing. */

const EXPIRED = 'Your sign-in has expired. Please sign in again.';

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderAt = path => render(<MemoryRouter initialEntries={[path]}><AppProvider><App /></AppProvider></MemoryRouter>);

describe("a manager's expired sign-in", () => {
  it('lands on the sign-in page, which says the sign-in expired', async () => {
    renderAt('/terms');
    act(() => { window.dispatchEvent(new Event('resumate:unauthorized')); });
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain(EXPIRED);
  });

  it('says nothing to someone who simply is not signed in', async () => {
    renderAt('/hiring');
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeTruthy();
    expect(screen.queryByText(EXPIRED)).toBeNull();
  });
});
