import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmDialog from './ConfirmDialog';

function renderOpen(props = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <ConfirmDialog open title="Delete everything?" onConfirm={onConfirm} onCancel={onCancel} {...props}>
      This removes every candidate.
    </ConfirmDialog>,
  );
  return { ...utils, onConfirm, onCancel, dialog: screen.getByRole('alertdialog') };
}

/* A page with a button that opens the dialog, as the call sites use it. */
function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Delete all</button>
      <ConfirmDialog open={open} title="Delete everything?" onConfirm={() => {}} onCancel={() => setOpen(false)}>
        This removes every candidate.
      </ConfirmDialog>
    </>
  );
}

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    render(<ConfirmDialog open={false} title="Delete?" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('is named by its title and described by what will be lost', () => {
    const { dialog } = renderOpen();
    expect(screen.getByRole('alertdialog', { name: 'Delete everything?' })).toBe(dialog);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const description = document.getElementById(dialog.getAttribute('aria-describedby'));
    expect(description.textContent).toBe('This removes every candidate.');
  });

  it('renders into the page body, where no parent can clip it', () => {
    const { container, dialog } = renderOpen();
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('starts on Cancel, so a stray Enter deletes nothing', () => {
    renderOpen();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('confirms only from the confirm button', () => {
    const { onConfirm, onCancel } = renderOpen({ confirmLabel: 'Delete all' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels on Cancel, Escape and the backdrop', () => {
    const { onCancel, onConfirm, dialog } = renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(dialog.previousSibling);
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows progress while busy and cannot be cancelled', () => {
    const { onCancel, dialog } = renderOpen({ busy: true });
    expect(dialog.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: 'Deleting…' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(dialog.previousSibling);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps Tab inside the dialog', () => {
    const { dialog } = renderOpen();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Delete' });
    confirm.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('lets no key through to the page behind it', () => {
    // The page's shortcuts listen on window: t flips the theme, n opens notifications.
    const pageKeys = vi.fn();
    window.addEventListener('keydown', pageKeys);
    try {
      const { dialog } = renderOpen();
      fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 't' });
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(pageKeys).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', pageKeys);
    }
  });

  it('holds focus itself while busy, with both buttons disabled', () => {
    const props = { open: true, title: 'Delete everything?', onConfirm: () => {}, onCancel: () => {} };
    const { rerender } = render(<ConfirmDialog {...props}>Gone.</ConfirmDialog>);
    rerender(<ConfirmDialog {...props} busy>Gone.</ConfirmDialog>);
    expect(document.activeElement).toBe(screen.getByRole('alertdialog'));
  });

  it('ignores the second click of a double-click on the button that opened it', () => {
    const { onCancel, dialog } = renderOpen();
    fireEvent.click(dialog.previousSibling, { detail: 2 });
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(dialog.previousSibling, { detail: 1 });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside when the message holds a field', () => {
    render(
      <ConfirmDialog open title="Rename?" onConfirm={() => {}} onCancel={() => {}}>
        <input aria-label="New name" />
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('alertdialog');
    const field = screen.getByRole('textbox', { name: 'New name' });
    const confirm = screen.getByRole('button', { name: 'Delete' });
    confirm.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('returns focus to the button that opened it', () => {
    render(<Page />);
    const opener = screen.getByRole('button', { name: 'Delete all' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
