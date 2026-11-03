import React, { useRef } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { keepTabInside, useModalFocus } from './modalFocus';

/* The keyboard in a modal panel, shared by ConfirmDialog and Jarvis. */

function Panel({ open, first }) {
  const ref = useRef(null);
  useModalFocus(ref, open, first);
  if (!open) return null;
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="Panel" onKeyDown={e => keepTabInside(e, ref.current)}>
      <button type="button">One</button>
      <button type="button" data-start>Two</button>
      <button type="button" disabled>Off</button>
      <button type="button">Three</button>
    </div>
  );
}

function Page({ open, first }) {
  return (
    <>
      <button type="button">Opener</button>
      <Panel open={open} first={first} />
    </>
  );
}

afterEach(cleanup);

describe('a modal panel', () => {
  it('takes focus as it opens: the control asked for, or itself', () => {
    const { rerender } = render(<Page open={false} />);
    rerender(<Page open first="[data-start]" />);
    expect(document.activeElement.textContent).toBe('Two');
    cleanup();
    const again = render(<Page open={false} />);
    again.rerender(<Page open />);
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Panel' }));
  });

  it('gives focus back to what had it on closing', () => {
    const { rerender } = render(<Page open={false} />);
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    rerender(<Page open />);
    rerender(<Page open={false} />);
    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab and Shift+Tab going round its controls, past disabled ones', () => {
    const { rerender } = render(<Page open={false} />);
    rerender(<Page open />);
    screen.getByRole('button', { name: 'Three' }).focus();
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(document.activeElement.textContent).toBe('One');
    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true });
    expect(document.activeElement.textContent).toBe('Three');
  });

  it('brings Tab back inside from the panel itself', () => {
    const { rerender } = render(<Page open={false} />);
    rerender(<Page open />);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Panel' }), { key: 'Tab', shiftKey: true });
    expect(document.activeElement.textContent).toBe('Three');
  });
});
