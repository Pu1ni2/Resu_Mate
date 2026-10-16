import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

import { AppProvider } from './context/AppContext';
import App from './App';

/* The router kept the window's scroll position from page to page, so "Back to
 * home" from near the end of the terms opened the homepage part-way down. A
 * link to another page now opens it at the top; Back is left to the browser. */

let scrollTo;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// What the browser's own buttons and a page's own links would do.
function Browser() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate(-1)}>Browser back</button>
      <button type="button" onClick={() => navigate('?section=2')}>Same page, new section</button>
    </>
  );
}

function renderApp(entries, index = entries.length - 1) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <AppProvider><App /><Browser /></AppProvider>
    </MemoryRouter>,
  );
}

describe('moving between pages', () => {
  it('leaves the first page where the browser put it', () => {
    renderApp(['/terms']);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('opens a page reached by a link at the top, at once', () => {
    renderApp(['/terms']);
    fireEvent.click(screen.getByRole('link', { name: 'Back to the homepage' }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  it('leaves Back to the browser', () => {
    renderApp(['/', '/terms']);
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('leaves a change within the same page alone', () => {
    renderApp(['/terms']);
    fireEvent.click(screen.getByRole('button', { name: 'Same page, new section' }));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
