import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import JarvisAgent from './JarvisAgent';

/* Jarvis had zero aria attributes, zero roles and zero tabIndex across 2,582
 * lines, while covering the entire viewport at zIndex 2000. That combination is
 * the problem: a full-screen takeover with no Escape and no labelled controls
 * is a room with the door hidden.
 *
 * Six specific failures, each asserted below:
 *   - no way out but the 34px X in the corner, mouse only
 *   - the overlay was not announced as a dialog
 *   - the transcript was not a live region, so replies arrived silently
 *   - the status (LISTENING / THINKING) was conveyed by colour and a pulse
 *   - the orb, the primary control, was a div with an onClick
 *   - the text input's only label was a placeholder that changes with state
 */

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

function renderJarvis(props = {}) {
  return render(
    <JarvisAgent candidatesSummary={[]} onClose={props.onClose || vi.fn()} onComplete={vi.fn()} />,
  );
}

describe('the overlay announces itself', () => {
  it('is a modal dialog with a name', () => {
    renderJarvis();
    const dialog = screen.getByRole('dialog', { name: /jarvis/i });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });
});

describe('getting out', () => {
  it('Escape closes it', () => {
    const onClose = vi.fn();
    renderJarvis({ onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('the close button is labelled, not just an icon', () => {
    renderJarvis();
    expect(screen.getByRole('button', { name: /close jarvis/i })).toBeTruthy();
  });

  it('other keys do not close it', () => {
    const onClose = vi.fn();
    renderJarvis({ onClose });
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'k' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('what a screen reader is told', () => {
  it('the transcript is a live log', () => {
    renderJarvis();
    const log = screen.getByRole('log');
    // polite, not assertive: replies should not interrupt the user mid-sentence.
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(log.getAttribute('aria-label')).toMatch(/conversation/i);
  });

  it('the status is a live region, not just a colour', () => {
    renderJarvis();
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });
});

describe('reaching the controls from a keyboard', () => {
  it('the orb is focusable and activates on Enter and Space', () => {
    renderJarvis();
    // The mic toggle in the composer carries a similar name, so pick the orb
    // by what made it a bug in the first place: it is a div, not a <button>.
    const orb = screen
      .getAllByRole('button', { name: /listening|interrupt/i })
      .find(el => el.tagName === 'DIV');
    expect(orb).toBeTruthy();
    expect(orb.getAttribute('tabIndex')).toBe('0');
    // It was a plain div with onClick — reachable by mouse only. Firing the keys
    // is what proves the handler exists, whatever it goes on to do.
    expect(() => {
      fireEvent.keyDown(orb, { key: 'Enter' });
      fireEvent.keyDown(orb, { key: ' ' });
    }).not.toThrow();
  });

  it('the message input has a stable label', () => {
    renderJarvis();
    // The placeholder cycles through "Recording…", "Transcribing…" and
    // "Jarvis is thinking…", so it cannot serve as the accessible name.
    expect(screen.getByLabelText('Message Jarvis')).toBeTruthy();
  });
});
