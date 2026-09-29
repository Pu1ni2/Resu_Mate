import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import Markdown, { renderMarkdown } from './Markdown';

/* Everything shown as markdown comes from model replies, resumes and scraped
 * profiles, so it is untrusted. Formatting survives; anything that runs does not. */

afterEach(cleanup);

describe('Markdown', () => {
  it('keeps the formatting', () => {
    const { container } = render(<Markdown text={'## Summary\n\n**Strong** Python, see [repo](https://github.com/ada)'} />);
    expect(container.querySelector('h2').textContent).toBe('Summary');
    expect(container.querySelector('strong').textContent).toBe('Strong');
    expect(container.querySelector('.md')).toBeTruthy();
  });

  it('drops scripts and event handlers', () => {
    const { container } = render(<Markdown text={'Hi<script>window.pwned = 1</script> <img src="x" onerror="window.pwned = 2"> **ok**'} />);
    expect(container.querySelector('script')).toBeNull();
    const img = container.querySelector('img');
    expect(img === null || img.getAttribute('onerror') === null).toBe(true);
    expect(container.innerHTML).not.toMatch(/onerror|pwned/);
    expect(container.querySelector('strong').textContent).toBe('ok');
  });

  it('drops javascript: and data: links but keeps web links', () => {
    const html = renderMarkdown('[a](javascript:alert(1)) [b](data:text/html,hi) [c](https://example.com)');
    expect(html).not.toMatch(/javascript:|data:text/);
    expect(html).toMatch(/href="https:\/\/example.com"/);
  });

  it('opens links in a new tab that cannot reach back', () => {
    const { container } = render(<Markdown text="[profile](https://github.com/ada)" />);
    const a = container.querySelector('a');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('drops iframes, styles and forms', () => {
    const html = renderMarkdown('<iframe src="https://evil.test"></iframe><style>body{display:none}</style><form action="https://evil.test"><input name="p"></form>');
    expect(html).not.toMatch(/iframe|<style|<form/);
  });

  it('renders nothing for empty or non-string input', () => {
    for (const text of [null, undefined, '', 42, { report: 'x' }]) {
      const { container, unmount } = render(<Markdown text={text} />);
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });

  it('passes className and style through', () => {
    const { container } = render(<Markdown text="hi" className="md custom" style={{ lineHeight: '1.7' }} />);
    const el = container.firstChild;
    expect(el.className).toBe('md custom');
    expect(el.style.lineHeight).toBe('1.7');
  });
});

describe('Markdown styling from the text itself', () => {
  it('drops inline styles that could overlay the page', () => {
    const html = renderMarkdown('<div style="position:fixed;inset:0;background:#fff">Session expired, log in again</div>');
    expect(html).not.toMatch(/style=|position:fixed/);
    expect(html).toMatch(/Session expired/); // the words stay, as plain text
  });
});
