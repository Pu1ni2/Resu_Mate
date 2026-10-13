import useMediaQuery from './useMediaQuery';

/* Does the user want less motion?
 *
 * The stylesheets collapse CSS animations and transitions under
 * `prefers-reduced-motion: reduce`, but some motion is out of their reach:
 * smooth scrolling asked for from script, and SVG SMIL `<animate>` elements,
 * which are not CSS and keep looping whatever animation-duration says. Callers
 * read this to leave that motion out.
 *
 * It follows the setting while the page is open: it can be toggled at any
 * time, and on Windows it commonly is.
 */
export default function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
