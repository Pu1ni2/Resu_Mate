import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import CandidateDashboard from './CandidateDashboard';

/* The portal showed the candidate the first résumé of the app's candidate list,
 * which is the hiring manager's, kept in the browser: a candidate on a browser a
 * manager had used saw someone else's résumé as theirs. */

const SESSION = { email: 'dana@x.com', name: 'Dana', has_interview: false, interview_completed: false, interview_config: null };
// A manager's candidates, left in this browser.
const MANAGERS_LIST = [{ id: 7, name: 'Grace Hopper', predicted_role: 'Rear Admiral', skills: ['COBOL'], is_resume: true }];
const OWN = { found: true, name: 'Dana', predicted_role: 'Writer', skills: ['Editing'], file_name: 'dana.pdf' };

let context;
let release;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  context = OWN;
  release = null;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).endsWith('/api/advisor/context')) {
      if (release) await new Promise(resolve => { release.push(resolve); });
      return { ok: true, status: 200, json: async () => context };
    }
    if (String(url).endsWith('/api/advisor/upload-resume')) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { name: 'Dana', predicted_role: 'Editor', skills: ['Proofs'] } }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

function open() {
  localStorage.setItem('resumate_candidates', JSON.stringify(MANAGERS_LIST));
  localStorage.setItem('resumate_candidate', JSON.stringify(SESSION));
  localStorage.setItem('resumate_candidate_token', 'cand-jwt');
  return render(
    <MemoryRouter initialEntries={['/candidate/dashboard']}>
      <AppProvider><CandidateDashboard /></AppProvider>
    </MemoryRouter>,
  );
}

describe("the candidate portal's résumé", () => {
  it("is the candidate's own, from the server, never the manager's list", async () => {
    open();
    // On the résumé card, as its role and in the line under the name.
    expect((await screen.findAllByText('Writer', { exact: false })).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Grace Hopper|Rear Admiral|COBOL/)).toBeNull();
    fireEvent.click(screen.getByText('Analysis'));
    expect(screen.queryByText(/Grace Hopper|Rear Admiral|COBOL/)).toBeNull();
  });

  it("is none, with the upload offered, when the server has none for them", async () => {
    context = { found: false };
    const { container } = open();
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/api/advisor/context'))).toBe(true));
    expect(container.querySelector('#cd-file')).toBeTruthy();
    expect(screen.queryByText(/Grace Hopper|Rear Admiral|COBOL/)).toBeNull();
  });

  it('is the one they upload, though the server answers with an older one after', async () => {
    release = [];
    const { container } = open();
    const file = new File(['Dana edits.'], 'dana.pdf', { type: 'application/pdf' });
    await act(async () => { fireEvent.change(container.querySelector('#cd-file'), { target: { files: [file] } }); });
    await act(async () => { release.forEach(resolve => resolve()); });
    fireEvent.click(screen.getByText('Analysis'));
    expect(container.querySelector('.cd-analysis-subtitle').textContent).toMatch(/^Editor/);
  });
});
