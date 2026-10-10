import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CandidateFocus from './CandidateFocus';

/* The hiring agent's Quick Setup suggests roles from the résumé. Start Over
 * cleared them, and they came back only when another candidate or tool was
 * opened, so a second evaluation offered nothing but "Other...". */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Data Scientist', skills: ['Python', 'SQL'], is_resume: true };
const realGetContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  // The opening animation draws on a canvas, which jsdom doesn't have.
  HTMLCanvasElement.prototype.getContext = () => ({ fillRect: () => {}, fillText: () => {} });
  mocks.app = { candidates: [ADA], anonymize: false, getDisplayName: c => c.name, getAvatarGradient: () => 'none' };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).endsWith('/api/chat/hiring-agent') ? { report: 'A strong fit.' } : {}),
  }));
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  vi.restoreAllMocks();
});

describe("the hiring agent's suggested roles", () => {
  it('come back after Start Over', async () => {
    render(<MemoryRouter><CandidateFocus /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Open Focus' }));
    // The tools show after the opening animation.
    fireEvent.click(await screen.findByRole('button', { name: 'Hiring Agent' }, { timeout: 8000 }));

    fireEvent.click(screen.getByRole('button', { name: /quick setup/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Data Scientist' }));
    fireEvent.click(screen.getByRole('button', { name: '3-5 years' }));
    fireEvent.click(screen.getByRole('button', { name: 'Senior' }));
    fireEvent.click(screen.getByRole('button', { name: /evaluate candidate/i }));
    fireEvent.click(await screen.findByRole('button', { name: /start over/i }));

    fireEvent.click(screen.getByRole('button', { name: /quick setup/i }));
    expect(screen.getByRole('button', { name: 'Data Scientist' })).toBeTruthy();
  }, 20000);
});
