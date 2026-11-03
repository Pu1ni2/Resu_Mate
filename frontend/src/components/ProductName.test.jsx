import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './Dashboard';
import { AppProvider, useApp } from '../context/AppContext';
import { chatAPI } from '../services/api';

/* The product is ResuMate. The browser tab and the description said
 * "ResuMate AI | Multi-Agent Hiring Platform", and the dashboard chat called
 * itself "ResuMate AI". */

const mocks = vi.hoisted(() => ({ app: null, real: false }));
vi.mock('../context/AppContext', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useApp: () => (mocks.real ? actual.useApp() : mocks.app) };
});

const ADA = { id: 1, name: 'Ada', predicted_role: 'Engineer', skills: ['Python'], is_resume: true };

beforeEach(() => {
  localStorage.clear();
  mocks.real = false;
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the product name', () => {
  it('is ResuMate in the tab and the description', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain('<title>ResuMate — See the person. Find the fit.</title>');
    expect(html).not.toMatch(/ResuMate AI|Multi-Agent/);
  });

  it('is ResuMate in the dashboard chat', () => {
    mocks.app = {
      candidates: [ADA], selectedIds: [1], selectedCandidates: [ADA], uploadProgress: {}, loading: false,
      loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
      clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
      anonymize: false, setAnonymize: vi.fn(), analytics: null,
      messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
      getDisplayName: c => c.name, getAvatarGradient: () => 'none',
      hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
    };
    render(<MemoryRouter initialEntries={['/hiring?view=chat']}><Dashboard /></MemoryRouter>);
    expect(document.querySelector('.chat-ai-name').textContent).toBe('ResuMate');
  });

  it('is ResuMate in the chat welcome when the server sends none', async () => {
    mocks.real = true;
    let app;
    function Probe() {
      app = useApp();
      return null;
    }
    vi.spyOn(chatAPI, 'getIntro').mockRejectedValue(new Error('Network Error'));
    render(<AppProvider><Probe /></AppProvider>);
    await act(async () => { await app.initChat(); });
    expect(app.messages[0].content).toMatch(/^\*\*Welcome to ResuMate!\*\*/);
  });
});
