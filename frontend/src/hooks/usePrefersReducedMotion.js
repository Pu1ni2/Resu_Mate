import { useEffect, useState } from 'react';

/* Does the user want less motion?
 *
 * design-system.css already collapses every CSS animation and transition under
 * `prefers-reduced-motion: reduce`. That covers most of the app, but it cannot
 * touch SVG SMIL -- `<animate>` elements are not CSS, so `animation-duration`
 * has no effect on them and they keep looping. On the landing page the SMIL
 * animations are the only infinite ones there are, which makes them exactly the
 * ones a motion-sensitive user needs stopped.
 *
 * So this reads the query in JS and callers skip rendering the `<animate>`
 * children entirely. Removing them leaves the paths at their authored attribute
 * values, which is the correct static frame -- no separate "reduced" artwork
 * needed.
 *
 * Listens for changes rather than reading once: the setting can be toggled while
 * the page is open, and on Windows it commonly is.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

export default function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setReduced(e.matches);
    // addEventListener on MediaQueryList is unsupported in older Safari, which
    // only has the deprecated addListener.
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return reduced;
}
