import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import useStudioPage from './useStudioPage';

/* The Studio pages are cream and the product's pages dark, so a phone's browser
 * bar has to follow the page, and the tab title too. */

function Page({ title }) {
  useStudioPage(title);
  return null;
}

let bar;

beforeEach(() => {
  document.title = 'ResuMate AI | Multi-Agent Hiring Platform';
  bar = document.createElement('meta');
  bar.setAttribute('name', 'theme-color');
  bar.setAttribute('content', '#09090B');
  document.head.appendChild(bar);
});

afterEach(() => {
  bar.remove();
});

describe('useStudioPage', () => {
  it('sets the tab title and a cream browser bar, and puts both back on leaving', () => {
    const { unmount } = render(<Page title="Welcome back — ResuMate" />);
    expect(document.title).toBe('Welcome back — ResuMate');
    expect(bar.getAttribute('content')).toBe('#f6f3eb');
    unmount();
    expect(document.title).toBe('ResuMate AI | Multi-Agent Hiring Platform');
    expect(bar.getAttribute('content')).toBe('#09090B');
  });

  it('follows a change of title on the same page, and still puts the first one back', () => {
    const { rerender, unmount } = render(<Page title="Your next chapter — ResuMate" />);
    rerender(<Page title="Check your inbox — ResuMate" />);
    expect(document.title).toBe('Check your inbox — ResuMate');
    unmount();
    expect(document.title).toBe('ResuMate AI | Multi-Agent Hiring Platform');
  });

  it('sets the title even with no browser-bar colour on the page', () => {
    bar.remove();
    expect(() => render(<Page title="Welcome back — ResuMate" />)).not.toThrow();
    expect(document.title).toBe('Welcome back — ResuMate');
  });
});
