import useMediaQuery from './useMediaQuery';

/* Does the user want less motion?
 *
 * The stylesheets collapse CSS animations and transitions under
 * `prefers-reduced-motion: reduce`, but script can't see that: the homepage
 * reads this to scroll without gliding, and to show that its motion switch is
 * overruled by the setting.
 *
 * It follows the setting while the page is open: it can be toggled at any
 * time, and on Windows it commonly is.
 */
export default function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
