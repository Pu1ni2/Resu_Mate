import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import JarvisAgent from './JarvisAgent';

/* Jarvis covers the whole page, but Tab walked out of it to the page behind,
 * where a keyboard user could reach Delete All out of sight, and closing it
 * left focus nowhere. */

beforeEach(() => {
  localStorage.clear();
  // Jarvis greets on mount through the speech API, which jsdom does not have.
  window.speechSynthesis = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true, status: 200, json: async () => ({ reply: '', action: null }),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The page behind: a button that opens Jarvis, and one Jarvis covers.
function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Ask Jarvis</button>
      <button type="button">Delete all</button>
      {open && <JarvisAgent candidatesSummary={[]} onClose={() => setOpen(false)} onComplete={vi.fn()} />}
    </>
  );
}

function openJarvis() {
  render(<Page />);
  const opener = screen.getByRole('button', { name: 'Ask Jarvis' });
  opener.focus();
  fireEvent.click(opener);
  return { opener, dialog: screen.getByRole('dialog', { name: /jarvis/i }) };
}

const focusables = dialog => [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href]')];

describe('the keyboard in Jarvis', () => {
  it('moves into it as it opens', () => {
    const { dialog } = openJarvis();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('goes round its own controls on Tab, and never to the page behind', () => {
    const { dialog } = openJarvis();
    const inside = focusables(dialog);
    inside[inside.length - 1].focus();
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(document.activeElement).toBe(inside[0]);
    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(inside[inside.length - 1]);
  });

  it('goes back to what opened it on closing', () => {
    const { opener } = openJarvis();
    // Working in Jarvis, then leaving it.
    screen.getByRole('button', { name: /close jarvis/i }).focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /jarvis/i })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
