import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CandidateFocus from './CandidateFocus';

/* The candidate file opens at once: its five sections, and the email and
 * interview waiting on a role evaluation. The original résumé comes through
 * its authenticated endpoint, only from a web address, and the extracted text
 * stays when there is none. Hidden names stay hidden, and an answer that
 * arrives for the previous file stays out of the next one. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));
vi.mock('../hooks/useVoice', () => ({ default: () => ({ stopSpeaking: vi.fn(), speakText: vi.fn(), loadingMsgIndex: null, speakingMsgIndex: null }) }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Data Scientist', skills: ['Python'], is_resume: true, text: 'Ada built reporting tools in Python.' };
const GRACE = { id: 2, name: 'Grace', predicted_role: 'Backend Engineer', skills: ['Go'], is_resume: true, text: 'Grace builds distributed systems.' };
const reply = (body = {}, status = 200) => ({ ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });
const open = (path = '/hiring/focus?candidate=1') => render(<MemoryRouter initialEntries={[path]}><CandidateFocus /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.app = { candidates: [ADA, GRACE], anonymize: false, getDisplayName: (c, i) => mocks.app.anonymize ? `Candidate ${i + 1}` : c.name };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply());
});
afterEach(() => { vi.restoreAllMocks(); });

describe('the candidate file', () => {
  it('opens the requested candidate immediately with all five sections and gated next actions', () => {
    open();
    expect(screen.getByRole('heading', { name: 'Ada' })).toBeTruthy();
    const sections = screen.getByRole('navigation', { name: 'Candidate file sections' });
    expect(sections.textContent).toMatch(/Overview.*Résumé.*Research.*Evaluation.*Interviews/);
    expect(screen.getByRole('button', { name: 'Draft email' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Create interview' }).disabled).toBe(true);
    // Nobody is looked up online until asked.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the extracted text available when no original file was stored', async () => {
    fetch.mockImplementation(async url => String(url).endsWith('/file') ? reply({ detail: 'No original file stored' }, 404) : reply());
    open();
    fireEvent.click(screen.getByRole('button', { name: /02 Résumé/ }));
    expect(screen.getByText(ADA.text)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Original file' }));
    expect(await screen.findByText(/original file is not available/i)).toBeTruthy();
    expect(screen.getByText(ADA.text)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Original file' }).disabled).toBe(false);
  });

  it('opens a stored original through its authenticated file endpoint', async () => {
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    fetch.mockImplementation(async url => String(url).endsWith('/file') ? reply({ url: 'https://files.example.test/resume.pdf' }) : reply());
    open();
    fireEvent.click(screen.getByRole('button', { name: /02 Résumé/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Original file' }));
    await waitFor(() => expect(opened).toHaveBeenCalledWith('https://files.example.test/resume.pdf', '_blank', 'noopener,noreferrer'));
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/api/candidates/1/file'))).toBe(true);
  });

  it('rejects an executable original-file link', async () => {
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    fetch.mockImplementation(async url => String(url).endsWith('/file') ? reply({ url: 'javascript:alert(1)' }) : reply());
    open();
    fireEvent.click(screen.getByRole('button', { name: /02 Résumé/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Original file' }));
    expect(await screen.findByText('The file link is unavailable.')).toBeTruthy();
    expect(opened).not.toHaveBeenCalled();
  });

  it('uses stable anonymous labels after filtering and hides original identifying text', () => {
    mocks.app.anonymize = true;
    open('/hiring/focus');
    expect(screen.getByRole('heading', { name: 'Candidate 2' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find a candidate file' }), { target: { value: 'Go' } });
    expect(screen.getByRole('heading', { name: 'Candidate 2' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open file for Candidate 2' }));
    expect(screen.getByRole('heading', { name: 'Candidate 2' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /02 Résumé/ }));
    expect(screen.queryByText(GRACE.text)).toBeNull();
    expect(screen.getByRole('button', { name: 'Original file' }).disabled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not apply a previous candidate’s late research to the newly opened file', async () => {
    let finishSearch;
    fetch.mockImplementation(url => String(url).endsWith('/web-search') ? new Promise(resolve => { finishSearch = resolve; }) : Promise.resolve(reply()));
    open();
    fireEvent.click(screen.getByRole('button', { name: /03 Research/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search the web' }), { target: { value: 'Ada projects' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(screen.getByRole('button', { name: 'All candidate files' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Find a candidate file' }), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open file for Grace' }));
    await act(async () => { finishSearch(reply({ results: [{ title: 'Ada research result', url: 'https://example.test', snippet: 'Details for Ada' }] })); });
    fireEvent.click(screen.getByRole('button', { name: /03 Research/ }));
    expect(screen.queryByText('Ada research result')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Search the web' }).disabled).toBe(false);
  });
});
