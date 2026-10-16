import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import api from '../services/api';
import RequestDeletion from './RequestDeletion';
import { PrivacyPage } from './LegalPage';
import Dashboard from './Dashboard';

/* Someone never invited had no way to have their data deleted, and a manager
 * had no way to delete their account. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useApp: () => mocks.app,
}));

const SENT = "If we hold any data about that address, we've emailed it a code to confirm the deletion.";

const refused = (status, detail) => {
  const err = new Error('refused');
  err.response = { status, data: { detail } };
  return err;
};

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function deletionPage() {
  render(<MemoryRouter initialEntries={['/privacy/delete']}><Routes>
    <Route path="/privacy/delete" element={<RequestDeletion />} />
  </Routes></MemoryRouter>);
}

describe('a deletion request', () => {
  it('takes the address, then the code, then deletes', async () => {
    const post = vi.spyOn(api, 'post')
      .mockResolvedValueOnce({ data: { message: SENT } })
      .mockResolvedValueOnce({ data: { status: 'deleted', records_removed: 1 } });
    deletionPage();
    fireEvent.change(screen.getByLabelText('Your email address'), { target: { value: ' grace@x.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect((await screen.findByRole('status')).textContent).toContain(SENT);
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '12a3456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything about me' }));
    expect(await screen.findByRole('heading', { name: 'Your data is deleted.' })).toBeTruthy();
    expect(post.mock.calls).toEqual([
      ['/privacy/erasure-code', { email: 'grace@x.com' }],
      ['/privacy/erase', { email: 'grace@x.com', code: '123456' }],
    ]);
  });

  it("shows the server's reason for a wrong code", async () => {
    vi.spyOn(api, 'post')
      .mockResolvedValueOnce({ data: { message: SENT } })
      .mockRejectedValueOnce(refused(400, 'That code is wrong or has expired. Ask for a new one.'));
    deletionPage();
    fireEvent.change(screen.getByLabelText('Your email address'), { target: { value: 'grace@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything about me' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/wrong or has expired/);
  });

  it('is linked from the Privacy Policy', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'request deletion' }).getAttribute('href')).toBe('/privacy/delete');
  });
});

/* The page in the sign-in pages' design: its own checks before anything is
 * sent, the keyboard on the heading at each step, and the way back. */
describe('the deletion page', () => {
  async function toTheCode(answer = { message: SENT }) {
    const post = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: answer });
    deletionPage();
    fireEvent.change(screen.getByLabelText('Your email address'), { target: { value: 'grace@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    await screen.findByLabelText('Code');
    return post;
  }

  it('names the tab', () => {
    deletionPage();
    expect(document.title).toBe('Delete your data — ResuMate');
  });

  it('checks the address before sending it', () => {
    const post = vi.spyOn(api, 'post');
    deletionPage();
    const field = screen.getByLabelText('Your email address');
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(screen.getByRole('alert').textContent).toContain('Please enter your email address.');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: 'grace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter a valid email address, such as you@example.com.');
    expect(post).not.toHaveBeenCalled();
  });

  it('checks the code before deleting anything', async () => {
    const post = await toTheCode();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything about me' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter the complete 6-digit code.');
    expect(document.activeElement).toBe(screen.getByLabelText('Code'));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('says it can’t be undone above each button', async () => {
    deletionPage();
    expect(screen.getByText(/^This can’t be undone\./)).toBeTruthy();
    cleanup();
    await toTheCode();
    expect(screen.getByText(/^This can’t be undone\./)).toBeTruthy();
  });

  it('puts the keyboard on the heading once the code is sent', async () => {
    await toTheCode();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Delete your data.' }));
  });

  it('shows the code from a development server without email', async () => {
    await toTheCode({ message: SENT, debug_code: '424242' });
    expect(screen.getByText('424242')).toBeTruthy();
  });

  it('goes back for a different address, keeping the one typed', async () => {
    await toTheCode();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different address' }));
    expect(screen.getByLabelText('Your email address').value).toBe('grace@x.com');
    expect(screen.queryByLabelText('Code')).toBeNull();
  });

  it('says so when there have been too many requests', async () => {
    vi.spyOn(api, 'post').mockRejectedValueOnce(refused(429, 'Rate limit exceeded'));
    deletionPage();
    fireEvent.change(screen.getByLabelText('Your email address'), { target: { value: 'grace@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Too many attempts.');
  });

  it('ends on what was deleted, with the heading taking the keyboard and the way back', async () => {
    vi.spyOn(api, 'post')
      .mockResolvedValueOnce({ data: { message: SENT } })
      .mockResolvedValueOnce({ data: { status: 'deleted', records_removed: 2 } });
    deletionPage();
    fireEvent.change(screen.getByLabelText('Your email address'), { target: { value: 'grace@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything about me' }));
    const title = await screen.findByRole('heading', { level: 1, name: 'Your data is deleted.' });
    expect(document.activeElement).toBe(title);
    expect(screen.getByRole('status').textContent).toContain('Everything ResuMate held about grace@x.com is deleted');
    expect(screen.getByRole('link', { name: 'Back to ResuMate' }).getAttribute('href')).toBe('/');
  });
});

describe("a manager's account", () => {
  function dashboard(logout) {
    mocks.app = {
      candidates: [], selectedIds: [], selectedCandidates: [], uploadProgress: {}, loading: false,
      loadCandidates: vi.fn(), uploadResume: vi.fn(), deleteCandidate: vi.fn(), clearAllCandidates: vi.fn(),
      toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(), anonymize: false, setAnonymize: vi.fn(),
      analytics: null, messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(),
      clearChat: vi.fn(), getDisplayName: c => c.name, getAvatarGradient: () => 'none',
      hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: logout,
    };
    render(<MemoryRouter initialEntries={['/hiring']}><Routes>
      <Route path="/hiring" element={<Dashboard />} />
      <Route path="/" element={<div>home page</div>} />
    </Routes></MemoryRouter>);
  }

  it('is deleted with the password, which signs out', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'deleted' }) });
    const logout = vi.fn();
    dashboard(logout);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'pw12345678' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete account' }).at(-1));
    expect(await screen.findByText('home page')).toBeTruthy();
    expect(logout).toHaveBeenCalled();
    const call = fetchSpy.mock.calls.find(([url]) => String(url).endsWith('/api/auth/delete-account'));
    expect(JSON.parse(call[1].body)).toEqual({ password: 'pw12345678' });
  });

  it('says so when the password is wrong, and stays signed in', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
      String(url).endsWith('/api/auth/delete-account')
        ? { ok: false, status: 403, json: async () => ({ detail: "That password isn't right." }) }
        : { ok: true, status: 200, json: async () => ({}) }
    ));
    const logout = vi.fn();
    dashboard(logout);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete account' }).at(-1));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("That password isn't right."));
    expect(logout).not.toHaveBeenCalled();
  });
});
