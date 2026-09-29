import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/* Markdown, rendered as sanitised HTML.
 *
 * Everything this app renders as markdown comes from somewhere untrusted:
 * model replies built from uploaded resumes, scraped GitHub and web profiles,
 * interview reports. marked passes raw HTML straight through, so a <script>,
 * an onerror handler or a javascript: link in that text used to run in the
 * page, where the manager's token lives in localStorage. DOMPurify removes all
 * of that and keeps the formatting.
 *
 * Use this instead of marked.parse + dangerouslySetInnerHTML anywhere.
 */

// Links in rendered text open in a new tab and can't reach back to this page.
// Registered once: hooks are global to the DOMPurify instance.
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text), { ADD_ATTR: ['target'] });
}

export default function Markdown({ text, className = 'md', style }) {
  const html = useMemo(() => {
    if (!text || typeof text !== 'string') return null;
    try {
      return renderMarkdown(text);
    } catch {
      return undefined; // unparseable: shown as plain text below
    }
  }, [text]);

  if (html === null) return null;
  if (html === undefined) {
    return <pre className={className} style={{ whiteSpace: 'pre-wrap', ...style }}>{text}</pre>;
  }
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}
