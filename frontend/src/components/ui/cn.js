/** Join conditional class names. Falsy entries are dropped.
 *
 *  Deliberately not clsx/tailwind-merge: the primitives here put caller
 *  classes last, so a caller can already override by passing a more specific
 *  utility, and that is the only conflict case in practice. Not worth two
 *  dependencies.
 */
export function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}
