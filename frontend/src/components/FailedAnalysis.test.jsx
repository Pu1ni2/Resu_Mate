import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './Dashboard';
import CandidateDashboard from './CandidateDashboard';

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
    expect(screen.getByText("Couldn't analyse this résumé. Delete it and upload it again.")).toBeTruthy();
    expect(screen.queryByText('Processing...')).toBeNull();
    expect(screen.queryByText('0y')).toBeNull();
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
