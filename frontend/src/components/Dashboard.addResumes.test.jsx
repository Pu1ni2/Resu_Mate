import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import Dashboard from './Dashboard';

/* Adding résumés to a collection that has people: a slim bar, not the
 * 112px tray that sat between the counts and the people. It still opens the
 * file picker and takes dropped files; an empty collection keeps the tray. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', skills: ['Python'], predicted_role: 'Engineer', is_resume: true };

function open(overrides = {}) {
  mocks.app = {
    candidates: [ADA], candidatesStatus: 'loaded', selectedIds: [], selectedCandidates: [], uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: null,
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter initialEntries={['/hiring']}>
      <Routes>
        <Route path="/hiring" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>,
  );
  return mocks.app;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('adding résumés', () => {
  it('is a slim bar once the collection has people', () => {
    open();
    const bar = screen.getByRole('button', { name: /^add résumés/i });
    expect(bar.textContent).toContain('PDF, DOCX, TXT');
    expect(screen.queryByText('Drop resumes here or click to upload')).toBeNull();
  });

  it('opens the file picker from the bar, with the keyboard too', () => {
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    open();
    fireEvent.keyDown(screen.getByRole('button', { name: /^add résumés/i }), { key: 'Enter' });
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it('takes files dropped on the bar', async () => {
    const app = open();
    const file = new File(['Ada\nEngineer'], 'ada.txt', { type: 'text/plain' });
    await act(async () => {
      fireEvent.drop(screen.getByRole('button', { name: /^add résumés/i }), { dataTransfer: { files: [file] } });
    });
    expect(app.uploadResume).toHaveBeenCalledWith(file);
  });

  it('is the full tray for an empty collection', () => {
    open({ candidates: [] });
    expect(screen.getByRole('button', { name: /drop resumes here or click to upload/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^add résumés/i })).toBeNull();
  });
});
