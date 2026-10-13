import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from './context/AppContext';
import App from './App';

/* The address everyone arrives at shows the Studio homepage; the old one, with
 * its agents showcase, is gone. */

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

describe('the homepage address', () => {
  it('shows the Studio homepage', () => {
    const { container } = renderAt('/');
    expect(container.querySelector('.studio')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('See the person.Find the fit.');
    expect(screen.queryByText(/Specialized AI Agents/)).toBeNull();
  });

  it('is where "Back to home" from the terms leads', () => {
    const { container } = renderAt('/terms');
    expect(container.querySelector('.studio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(container.querySelector('.studio')).toBeTruthy();
  });
});
