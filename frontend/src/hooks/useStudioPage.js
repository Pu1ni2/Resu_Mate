import { useEffect } from 'react';

/* A Studio page's tab title, and the cream browser bar on phones, while the page
 * is open. Both go back to what they were when it closes. */

const PAPER = '#f6f3eb';

export default function useStudioPage(title) {
  useEffect(() => {
    const bar = document.querySelector('meta[name="theme-color"]');
    const before = { title: document.title, bar: bar?.getAttribute('content') };
    document.title = title;
    bar?.setAttribute('content', PAPER);
    return () => {
      document.title = before.title;
      if (bar && before.bar) bar.setAttribute('content', before.bar);
    };
  }, [title]);
}
