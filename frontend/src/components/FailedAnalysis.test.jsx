import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './Dashboard';
import CandidateDashboard from './CandidateDashboard';
import api, { candidatesAPI } from '../services/api';
import { TOAST_EVENT } from '../services/notify';

/* A résumé the AI couldn't analyse was shown as "Professional · Entry · 0y" to
 * the manager, and as "Professional · Mid" to the candidate. The server marks it
 * now (analysis_failed), and the cards say so and how to retry. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const FAILED = {
  id: 1, name: 'Ada', analysis_failed: true, predicted_role: null, experience_level: null,
  total_experience_years: null, skills: [], is_resume: true,
};

function app(overrides = {}) {
  return {
    candidates: [], selectedIds: [], selectedCandidates: [], uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn(), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: null,
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
    candidateSession: null, setCandidateSession: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the manager's card", () => {
  it('says the analysis failed and how to retry, with no made-up profile', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    mocks.app = app({ candidates: [FAILED] });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText("Couldn't analyse this résumé.")).toBeTruthy();
    expect(screen.getByRole('button', { name: "Read Ada's résumé again" })).toBeTruthy();
    expect(screen.queryByText('Processing...')).toBeNull();
    expect(screen.queryByText('0y')).toBeNull();
  });
});

/* It said to delete the candidate and upload the file again. The AI reads it
 * again instead, and the card shows it being read. */
describe('reading a résumé again', () => {
  const READ_AGAIN = { ...FAILED, analysis_failed: false, analysis_status: 'pending' };
  let toasts;
  const onToast = e => toasts.push(e.detail);

  beforeEach(() => {
    toasts = [];
    window.addEventListener(TOAST_EVENT, onToast);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  });

  afterEach(() => {
    window.removeEventListener(TOAST_EVENT, onToast);
  });

  it('asks for it from the card, and shows it being read', async () => {
    const readAgain = vi.spyOn(candidatesAPI, 'readAgain').mockResolvedValue({ data: READ_AGAIN });
    const setCandidates = vi.fn();
    mocks.app = app({ candidates: [FAILED], setCandidates });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: "Read Ada's résumé again" }));
    await waitFor(() => expect(setCandidates).toHaveBeenCalledTimes(1));
    expect(readAgain).toHaveBeenCalledWith(1);
    const [update] = setCandidates.mock.calls[0];
    expect(update([FAILED, { id: 9, name: 'Bo' }]).map(c => [c.id, c.analysis_status])).toEqual([[1, 'pending'], [9, undefined]]);
    // The card isn't selected by it.
    expect(mocks.app.toggleSelection).not.toHaveBeenCalled();
  });

  it('asks for it from the list too', async () => {
    const readAgain = vi.spyOn(candidatesAPI, 'readAgain').mockResolvedValue({ data: READ_AGAIN });
    mocks.app = app({ candidates: [FAILED], setCandidates: vi.fn() });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    fireEvent.click(within(screen.getByRole('group', { name: 'Show the collection as' })).getByRole('button', { name: 'List' }));
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: "Read Ada's résumé again" }));
    await waitFor(() => expect(readAgain).toHaveBeenCalledWith(1));
  });

  it("asks the server at the candidate's own address", async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: READ_AGAIN });
    await candidatesAPI.readAgain(7);
    expect(post).toHaveBeenCalledWith('/candidates/7/analyze');
  });

  it("says why, when it can't be", async () => {
    vi.spyOn(candidatesAPI, 'readAgain').mockRejectedValue({ response: { data: { detail: 'This résumé has been read already.' } } });
    const setCandidates = vi.fn();
    mocks.app = app({ candidates: [FAILED], setCandidates });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: "Read Ada's résumé again" }));
    await waitFor(() => expect(toasts).toEqual([{ message: 'This résumé has been read already.', type: 'error' }]));
    expect(setCandidates).not.toHaveBeenCalled();
  });
});

describe('a résumé the AI is still reading, or has read', () => {
  // Read in the background, after the upload has answered.
  const READING = { id: 2, name: 'Bea', analysis_status: 'pending', predicted_role: null, skills: [], is_resume: true };
  const NO_ROLE = { id: 3, name: 'Cy', analysis_status: 'done', predicted_role: null, skills: [], is_resume: true };
  const showList = () => fireEvent.click(
    within(screen.getByRole('group', { name: 'Show the collection as' })).getByRole('button', { name: 'List' }));

  it('says it is being read, on its card and in the list', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    mocks.app = app({ candidates: [READING] });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText('Reading the résumé…')).toBeTruthy();
    showList();
    expect(within(screen.getByRole('table')).getByText('Reading the résumé…')).toBeTruthy();
  });

  it('shows no role it found as unknown, not as still processing', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    mocks.app = app({ candidates: [NO_ROLE] });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.queryByText('Processing...')).toBeNull();
    expect(screen.queryByText('Reading the résumé…')).toBeNull();
    showList();
    expect(screen.queryByText('Processing...')).toBeNull();
  });
});

describe("the candidate's résumé", () => {
  it('says it could not be analysed, and that uploading again retries', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
      String(url).endsWith('/api/advisor/upload-resume')
        ? { ok: true, status: 200, json: async () => ({ success: true, data: { ...FAILED, name: 'Dana' } }) }
        : { ok: true, status: 200, json: async () => ({}) }
    ));
    const session = { email: 'dana@x.com', name: 'Dana', has_interview: false };
    localStorage.setItem('resumate_candidate_token', 'cand-jwt');
    mocks.app = app({ candidateSession: session });
    const { container } = render(<MemoryRouter><CandidateDashboard /></MemoryRouter>);
    const input = container.querySelector('#cd-file');
    fireEvent.change(input, { target: { files: [new File(['Dana'], 'dana.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText("We couldn't analyse your résumé. Upload it again to retry.")).toBeTruthy();
    expect(screen.queryByText(/Professional/)).toBeNull();
  });
});
