import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { pressable } from './pressable';

/* Cards, tabs and switches were divs with onClick: a mouse could use them, a
 * keyboard couldn't reach them, and a screen reader read them as plain text. */

describe('pressable', () => {
  it('is announced as a button and is in the Tab order', () => {
    render(<div {...pressable(vi.fn())}>Open the report</div>);
    expect(screen.getByRole('button', { name: 'Open the report' }).tabIndex).toBe(0);
  });

  it('is pressed by a click, Enter or Space', () => {
    const onPress = vi.fn();
    render(<div {...pressable(onPress)}>Open</div>);
    const el = screen.getByRole('button', { name: 'Open' });
    fireEvent.click(el);
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.keyDown(el, { key: ' ' });
    expect(onPress).toHaveBeenCalledTimes(3);
  });

  it("stops Space scrolling the page, as a button's would", () => {
    render(<div {...pressable(vi.fn())}>Open</div>);
    // fireEvent returns false when the event's default action was prevented.
    expect(fireEvent.keyDown(screen.getByRole('button'), { key: ' ' })).toBe(false);
  });

  it('ignores other keys', () => {
    const onPress = vi.fn();
    render(<div {...pressable(onPress)}>Open</div>);
    const el = screen.getByRole('button');
    for (const key of ['a', 'Tab', 'Escape']) fireEvent.keyDown(el, { key });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('leaves keys pressed on something inside it to that thing', () => {
    const onPress = vi.fn();
    render(<div {...pressable(onPress)}>Card <input aria-label="Note" /></div>);
    // Not pressed, and the space still gets typed.
    expect(fireEvent.keyDown(screen.getByRole('textbox', { name: 'Note' }), { key: ' ' })).toBe(true);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('takes another role, and a name for when its text would not do', () => {
    render(<div {...pressable(vi.fn(), { role: 'switch', label: 'Anonymize candidates' })} aria-checked="false" />);
    expect(screen.getByRole('switch', { name: 'Anonymize candidates' })).toBeTruthy();
  });

  it('adds no name of its own when not given one', () => {
    expect(pressable(vi.fn())).not.toHaveProperty('aria-label');
  });
});
