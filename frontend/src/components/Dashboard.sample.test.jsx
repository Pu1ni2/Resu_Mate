import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './Dashboard';

/* A new hiring manager with no résumés to hand can try ResuMate on a made-up
 * person's (frontend/public/sample-resume.pdf). */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

function app(candidates = []) {
  return {
    candidates, selectedIds: [], selectedCandidates: [], uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: null,
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
  };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
    String(url).endsWith('/sample-resume.pdf')
      ? { ok: true, status: 200, blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }) }
      : { ok: true, status: 200, json: async () => ({}) }
  ));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the upload screen', () => {
  it('offers a made-up sample résumé while there are no candidates', async () => {
    mocks.app = app();
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /try a made-up sample/i }));
    await waitFor(() => expect(mocks.app.uploadResume).toHaveBeenCalledTimes(1));
    const file = mocks.app.uploadResume.mock.calls[0][0];
    expect(file.name).toBe('sample-resume.pdf');
    expect(file.type).toBe('application/pdf');
  });

  it('stops offering it once there are candidates', () => {
    mocks.app = app([{ id: 1, name: 'Ada', skills: ['Python'], predicted_role: 'Engineer', is_resume: true }]);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /try a made-up sample/i })).toBeNull();
  });
});
