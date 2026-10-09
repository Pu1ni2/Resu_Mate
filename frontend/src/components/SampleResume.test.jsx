import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import CandidateLogin from './CandidateLogin';
import CandidateDashboard from './CandidateDashboard';

/* The candidate portal had a demo account: a real person's name, address,
 * employers and education, a sign-in shortcut, and unlimited retakes for that
 * address. It also offered every candidate the sample résumé, which then stood
 * in for their own. The sample is a made-up person's now, and it is the hiring
 * manager's (see Dashboard.sample.test.jsx). */

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function portal(page) {
  return render(<MemoryRouter><AppProvider>{page}</AppProvider></MemoryRouter>);
}

describe('the candidate sign-in page', () => {
  it('offers no demo account', () => {
    portal(<CandidateLogin />);
    expect(screen.queryByRole('button', { name: /sample resume/i })).toBeNull();
    expect(screen.queryByText('Demo')).toBeNull();
  });

  it('asks the server for a code for every address', async () => {
    portal(<CandidateLogin />);
    fireEvent.change(screen.getByPlaceholderText('Enter your email address'), { target: { value: 'dana@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send access code/i }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/auth\/candidate\/send-otp$/);
    expect(JSON.parse(options.body)).toEqual({ email: 'dana@x.com' });
  });
});

describe("the candidate's résumé tab", () => {
  it('offers no sample résumé to stand in for theirs', () => {
    localStorage.setItem('resumate_candidate', JSON.stringify({ email: 'dana@x.com', name: 'Dana', has_interview: false }));
    localStorage.setItem('resumate_candidate_token', 'cand-jwt');
    portal(<CandidateDashboard />);
    expect(screen.getByText('Upload Your Resume')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sample resume/i })).toBeNull();
    expect(screen.queryByText(/sample resume available/i)).toBeNull();
  });
});
