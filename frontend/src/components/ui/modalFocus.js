import { useEffect } from 'react';

/* The keyboard in a modal panel: focus moves in as it opens, Tab stays inside
 * while it's open, and focus goes back to what had it when it closes.
 * ConfirmDialog's, shared: Jarvis covered the whole page without it, so Tab
 * walked out to the page behind, and closing it left focus nowhere. */

export const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* Focus moves into the panel while `open`: to `first`, a selector inside it,
 * when there is one, or else to the panel itself (which needs tabIndex={-1}).
 * It goes back to what had it on closing. */
export function useModalFocus(panelRef, open, first) {
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const panel = panelRef.current;
    const target = (first && panel?.querySelector(first)) || panel;
    target?.focus?.();
    return () => opener?.focus?.();
    // Only on opening and closing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/* For the panel's onKeyDown: Tab, and Shift+Tab, go round the panel's own
 * controls, and back inside from anywhere else. */
export function keepTabInside(e, panel) {
  if (e.key !== 'Tab' || !panel) return;
  const focusable = [...panel.querySelectorAll(FOCUSABLE)];
  if (!focusable.length) {
    e.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!panel.contains(active)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && (active === first || active === panel)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
