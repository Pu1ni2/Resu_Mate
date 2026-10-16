import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/* A heading that takes the keyboard when the screen changes: when the page was
 * reached from another page in the app, or when `focusKey` changes on the same
 * page (the candidate sign-in's two steps). Not when the page is opened
 * directly, where the browser's own start is right. The ref goes on a heading
 * with tabIndex -1. */
export default function useHeadingFocus(focusKey) {
  const { key } = useLocation();
  const heading = useRef(null);
  const seen = useRef(focusKey);

  useEffect(() => {
    const changed = seen.current !== focusKey;
    seen.current = focusKey;
    if (changed || key !== 'default') heading.current?.focus({ preventScroll: true });
  }, [key, focusKey]);

  return heading;
}
