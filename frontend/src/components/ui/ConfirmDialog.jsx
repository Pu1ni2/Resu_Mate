import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';

/* ConfirmDialog
 *
 * An in-page "are you sure?" for actions that cannot be undone. Replaces
 * window.confirm, which freezes the whole page, cannot say much or match the
 * app, and is switched off in some embedded browsers, where it returns false
 * straight away and the button seems to do nothing.
 *
 * - role="alertdialog": it interrupts, and needs an answer.
 * - Focus starts on Cancel, the safe choice, so a stray Enter deletes nothing.
 * - Escape, Cancel and the backdrop all cancel. Tab stays inside the dialog,
 *   and no key reaches the page behind it.
 * - Focus goes back to whatever opened it.
 * - While `busy` nothing cancels it: the request is already on its way.
 *
 * Rendered into <body> so no parent's stacking or overflow can clip it, and
 * above every other layer, toasts included. Jarvis's full-screen overlay does
 * not trap focus, so a keyboard user could reach Delete All behind it, and the
 * dialog opened underneath, out of sight. Both callers show their errors after
 * it closes.
 */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Delete',
  busyLabel = 'Deleting…',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    panelRef.current?.querySelector('[data-cancel]')?.focus();
    return () => opener?.focus?.();
  }, [open]);

  // While busy both buttons are disabled, and the browser moves focus off a
  // button that becomes disabled, to the page, where Tab and the page's
  // shortcuts then work behind the dialog. The panel holds it instead.
  useEffect(() => {
    if (open && busy) panelRef.current?.focus();
  }, [open, busy]);

  if (!open) return null;

  const cancel = () => {
    if (!busy) onCancel();
  };

  function onKeyDown(e) {
    // Nothing behind a modal answers keys: the page's shortcuts (t for the
    // theme, n for notifications) fired through it.
    e.stopPropagation();
    if (e.key === 'Escape') {
      cancel();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE)];
    if (!focusable.length) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4">
      {/* The second click of a double-click on the opener lands here, the
          dialog being open by then. It used to cancel at once, so the dialog
          only flashed. A click that is part of a double-click doesn't count. */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={e => { if (e.detail <= 1) cancel(); }}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        aria-busy={busy || undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative w-full max-w-md rounded-[18px] border border-line bg-surface p-5 shadow-e3 outline-none"
      >
        <h2 id={titleId} className="m-0 text-[15px] font-semibold text-ink">{title}</h2>
        <div id={bodyId} className="mt-2 text-[13px] leading-relaxed text-ink-muted">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button data-cancel size="sm" variant="secondary" onClick={cancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button size="sm" variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
