import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import App from '../App';

/* Signing out and deleting all of a candidate's data sat side by side as
 * everyday buttons in the portal's sidebar. They're in the account's menu. */

const SESSION = {
  email: 'dana@x.com', name: 'Dana', has_interview: false, interview_completed: false, interview_config: null,
};

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function openPortal() {
  localStorage.setItem('resumate_candidate', JSON.stringify(SESSION));
  localStorage.setItem('resumate_candidate_token', 'cand-jwt');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => ({
    ok: true, status: 200, json: async () => (String(url).endsWith('/api/chat/candidate/me') ? SESSION : {}),
  }));
  render(
    <MemoryRouter initialEntries={['/candidate/dashboard']}>
      <AppProvider><App /></AppProvider>
      <Where />
    </MemoryRouter>,
  );
}

const menu = async () => (await screen.findByLabelText('Account: Dana', {}, { timeout: 5000 })).closest('details');

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the portal's account menu", () => {
  it('holds signing out and deleting the data, closed until opened', async () => {
    openPortal();
    const details = await menu();
    expect(details.open).toBe(false);
    expect(details.contains(screen.getByRole('button', { name: 'Sign out' }))).toBe(true);
    expect(details.contains(screen.getByRole('button', { name: 'Delete my data…' }))).toBe(true);
    expect(screen.queryByRole('button', { name: /Logout/ })).toBeNull();
  });

  it('signs out', async () => {
    openPortal();
    await menu();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByTestId('where').textContent).toBe('/candidate/login');
    expect(localStorage.getItem('resumate_candidate_token')).toBeNull();
  });

  it('asks before deleting the data', async () => {
    openPortal();
    await menu();
    fireEvent.click(screen.getByRole('button', { name: 'Delete my data…' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete all your data?' })).toBeTruthy();
  });
});
