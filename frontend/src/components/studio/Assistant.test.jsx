import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

import Assistant from './Assistant';

/* One assistant, with what it answers about in view. "Candidate chat" and
 * "Ask Jarvis" sat side by side in the sidebar, named differently. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', is_resume: true };
const BEA = { id: 2, name: 'Bea', is_resume: true };
const NOTE = { id: 3, name: 'Shopping list', is_resume: false };

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

/** The assistant on a page that isn't the dashboard, beside another control. */
function show(props = {}, selected = []) {
  mocks.app = { candidates: [ADA, BEA, NOTE], selectedCandidates: selected, anonymize: false, getDisplayName: c => c.name };
  render(
    <MemoryRouter initialEntries={['/hiring/sourcer']}>
      <Routes>
        <Route path="*" element={<><Assistant {...props} /><button type="button">Elsewhere</button><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByRole('button', { name: 'Assistant' });
}

const choices = () => screen.queryByRole('group', { name: 'Ask about' });
// Each choice's name, without what it says it answers from.
const named = () => [...choices().querySelectorAll('a, button')].map(el => el.querySelector('span').textContent);
const about = name => screen.getByText(name).nextElementSibling.textContent;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  // Jarvis greets on opening through the speech API, which jsdom does not have.
  window.speechSynthesis = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the assistant', () => {
  it('is one button, closed until it is asked', () => {
    const button = show();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(choices()).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(choices().id);
    fireEvent.click(button);
    expect(choices()).toBeNull();
  });

  it('offers the selected candidates and the whole workspace, the narrower first', () => {
    fireEvent.click(show());
    expect(named()).toEqual(['Selected candidates', 'The whole workspace']);
    expect(about('The whole workspace')).toBe('Jarvis, across every candidate. It can act, and asks first.');
  });
});

describe('the selected candidates', () => {
  it('are counted as it opens, résumés only', () => {
    fireEvent.click(show({}, [ADA, BEA, NOTE]));
    expect(about('Selected candidates')).toBe('Answers from the 2 you selected');
  });

  it('say "one" for one', () => {
    fireEvent.click(show({}, [ADA]));
    expect(about('Selected candidates')).toBe('Answers from the one you selected');
  });

  it('say where to select them when there are none', () => {
    fireEvent.click(show({}, [NOTE]));
    expect(about('Selected candidates')).toBe('Select them in Candidates first');
  });

  it('lead to their chat from a page other than the dashboard', () => {
    fireEvent.click(show({}, [ADA]));
    const link = screen.getByRole('link', { name: /^Selected candidates/ });
    expect(link.getAttribute('href')).toBe('/hiring?view=chat');
    fireEvent.click(link);
    expect(screen.getByTestId('where').textContent).toBe('/hiring?view=chat');
    expect(choices()).toBeNull();
  });

  it("open the dashboard's own chat there, marked while it is open", () => {
    const onSelected = vi.fn();
    const button = show({ onSelected, selectedOpen: true }, [ADA]);
    fireEvent.click(button);
    const chat = screen.getByRole('button', { name: /^Selected candidates/ });
    expect(chat.getAttribute('aria-current')).toBe('page');
    fireEvent.click(chat);
    expect(onSelected).toHaveBeenCalledTimes(1);
    expect(choices()).toBeNull();
    // The choice is gone, so the focus is kept on the assistant.
    expect(document.activeElement).toBe(button);
  });
});

describe('the whole workspace', () => {
  it('opens Jarvis over the page, which gives the focus back to the assistant when it closes', async () => {
    const button = show();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: /^The whole workspace/ }));
    expect(choices()).toBeNull();
    expect(await screen.findByRole('dialog', { name: 'Jarvis, the hiring copilot' }, { timeout: 5000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /close jarvis/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Jarvis, the hiring copilot' })).toBeNull());
    expect(document.activeElement).toBe(button);
  });
});

describe('the choices', () => {
  it('close on Escape, with the focus back on the assistant', () => {
    const button = show();
    fireEvent.click(button);
    const first = screen.getByRole('link', { name: /^Selected candidates/ });
    first.focus();
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(choices()).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('close on a press elsewhere, and not on one inside them', () => {
    fireEvent.click(show());
    fireEvent.pointerDown(choices());
    expect(choices()).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(choices()).toBeNull();
  });

  it('close when the keyboard leaves them, and not while it moves inside', () => {
    fireEvent.click(show());
    const first = screen.getByRole('link', { name: /^Selected candidates/ });
    const last = screen.getByRole('button', { name: /^The whole workspace/ });
    fireEvent.focusOut(first, { relatedTarget: last });
    expect(choices()).toBeTruthy();
    fireEvent.focusOut(last, { relatedTarget: screen.getByRole('button', { name: 'Elsewhere' }) });
    expect(choices()).toBeNull();
  });
});
