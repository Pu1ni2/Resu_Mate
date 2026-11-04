import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CandidateFocus from './CandidateFocus';

/* An open file's heading is the person's name, with the ways back above it.
 * "The candidate file." sat over the name, as large. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));
vi.mock('../hooks/useVoice', () => ({ default: () => ({ stopSpeaking: vi.fn(), speakText: vi.fn(), loadingMsgIndex: null, speakingMsgIndex: null }) }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Data Scientist', skills: ['Python'], is_resume: true, text: 'Ada built reporting tools in Python.' };
const reply = (body = {}) => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });
const open = (path = '/hiring/focus?candidate=1') => render(<MemoryRouter initialEntries={[path]}><CandidateFocus /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.app = { candidates: [ADA], anonymize: false, getDisplayName: (c, i) => mocks.app.anonymize ? `Candidate ${i + 1}` : c.name };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply());
});
afterEach(() => { vi.restoreAllMocks(); });

describe("an open file's heading", () => {
  it("is the person's name, the page's one main heading", () => {
    open();
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Ada']);
    expect(screen.queryByText('The candidate file.')).toBeNull();
  });

  it('follows Hide names', () => {
    mocks.app.anonymize = true;
    open();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Candidate 1');
  });

  it('has the ways back above it: every file, and the screening results it came from', () => {
    open('/hiring/focus?candidate=1&run=7');
    const back = screen.getByRole('button', { name: 'All candidate files' });
    expect(screen.getByRole('link', { name: 'Screening results' }).getAttribute('href')).toBe('/hiring?view=screening&run=7');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
