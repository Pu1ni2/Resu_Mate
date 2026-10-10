/* What a <button> gives for free, for an element that is styled as a card, a
 * tab or a switch and can't become one without restyling: it can be reached
 * with Tab, Enter or Space presses it, and a screen reader says what it is.
 *
 * These were divs with onClick, which a keyboard can't reach and a screen
 * reader reads as plain text.
 *
 *   <div className="card" {...pressable(open)}>
 *   <div className="toggle" {...pressable(flip, { role: 'switch' })} aria-checked={on}>
 *
 * Keys pressed on something inside (a delete button on a card) are left to it.
 */
export function pressable(onPress, { role = 'button', label } = {}) {
  return {
    role,
    tabIndex: 0,
    ...(label ? { 'aria-label': label } : {}),
    onClick: onPress,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPress(e);
      }
    },
  };
}
