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
 * - Escape, Cancel and the backdrop all cancel. Tab stays inside the dialog.
 * - Focus goes back to whatever opened it.
 * - While `busy` nothing cancels it: the request is already on its way.
 *
 * Rendered into <body> so no parent's stacking or overflow can clip it, on the
 * modal layer (--z-modal), which is below toasts, so an error still shows.
 */
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

  if (!open) return null;

  const cancel = () => {
    if (!busy) onCancel();
  };

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancel();
      return;
    }
    if (e.key !== 'Tab') return;
    const buttons = [...panelRef.current.querySelectorAll('button:not([disabled])')];
    if (!buttons.length) {
      e.preventDefault();
      return;
    }
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
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
    <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={cancel} aria-hidden="true" />
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
