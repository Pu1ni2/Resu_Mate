import { useCallback, useSyncExternalStore } from 'react';

/* Does a media query match right now, e.g. '(max-width: 1100px)'?
 *
 * Answers on the first render, so nothing shows a frame of the wrong state, and
 * follows changes while the page is open: a window gets resized, and a setting
 * like reduced motion can be toggled at any time. Without matchMedia (jsdom, a
 * very old browser) the answer is false.
 */
export default function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    // addEventListener on MediaQueryList is unsupported in older Safari, which
    // only has the deprecated addListener.
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  const matches = () => (
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false
  );

  return useSyncExternalStore(subscribe, matches, () => false);
}
