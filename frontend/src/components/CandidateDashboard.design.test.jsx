import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import CandidateDashboard from './CandidateDashboard';

/* The candidate portal in the Studio design: the candidate's own studio, with
 * each tab introduced, no ® after the name, and nothing said of a résumé's
 * role, level or years when it has none ("Role · Level · 0y experience"). */

const SESSION = { email: 'dana@x.com', name: 'Dana', has_interview: false, interview_completed: false, interview_config: null };
// What the server makes of a résumé that names no role, level or years.
const PARSED = { name: 'Dana', skills: ['Writing'], file_name: 'dana.pdf' };

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => ({
    ok: true, status: 200,
    json: async () => (String(url).endsWith('/api/advisor/upload-resume') ? { success: true, data: PARSED } : {}),
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

function open() {
  localStorage.setItem('resumate_candidate', JSON.stringify(SESSION));
  localStorage.setItem('resumate_candidate_token', 'cand-jwt');
  return render(
    <MemoryRouter initialEntries={['/candidate/dashboard']}>
      <AppProvider><CandidateDashboard /></AppProvider>
    </MemoryRouter>,
  );
}

describe('the candidate portal in the Studio design', () => {
  it("is the candidate's own studio, its brand with no ®", () => {
    const { container } = open();
    expect(container.querySelector('.studio-candidate')).toBeTruthy();
    expect(screen.getByText('Candidate studio')).toBeTruthy();
    expect(container.querySelector('.cd-account').textContent).toBe('DDanadana@x.com');
    expect(container.textContent).not.toMatch(/®/);
  });

  it('introduces each tab with a heading of its own', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'A little more you.' })).toBeTruthy();
    fireEvent.click(screen.getByText('AI Advisor'));
    expect(screen.getByRole('heading', { level: 1, name: 'A fresh perspective.' })).toBeTruthy();
  });

  it("shows which of the advisor's modes is on", () => {
    open();
    fireEvent.click(screen.getByText('AI Advisor'));
    expect(screen.getByRole('button', { name: /^General/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /^Resume Coach/ }));
    expect(screen.getByRole('button', { name: /^Resume Coach/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^General/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it("says nothing of a role, level or years the résumé doesn't give", async () => {
    const { container } = open();
    const file = new File(['Dana writes.'], 'dana.pdf', { type: 'application/pdf' });
    await act(async () => { fireEvent.change(container.querySelector('#cd-file'), { target: { files: [file] } }); });
    fireEvent.click(screen.getByText('Analysis'));
    expect(container.querySelector('.cd-analysis-subtitle').textContent).toBe('Your résumé profile');
    expect(container.querySelector('.cd-mini-stat-value').textContent).toBe('—');
  });
});
