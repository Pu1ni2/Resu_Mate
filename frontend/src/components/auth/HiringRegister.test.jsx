import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import HiringRegister from './HiringRegister';
import { AppProvider } from '../../context/AppContext';
import api from '../../services/api';

/* Registration, which had no tests.
 *
 * The defect worth pinning: the three client-side guards ran in the order
 * confirm-match, password-length, name — so leaving the name blank and
 * mistyping the confirm reported "Passwords do not match". You fixed the
 * password, submitted again, and only then learned about the name. They now run
 * in the order the fields appear.
 */

const DASHBOARD = 'dashboard-reached';

function setup() {
  return render(
    <MemoryRouter initialEntries={['/hiring/register']}>
      <AppProvider>
        <Routes>
          <Route path="/hiring/register" element={<HiringRegister />} />
          <Route path="/hiring" element={<div>{DASHBOARD}</div>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  );
}

const ok = {
  data: {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    user: { id: 1, email: 'jane@co.com', name: 'Jane Smith' },
  },
};

const httpError = (status, detail) => {
  const err = new Error('request failed');
  err.response = { status, data: detail === undefined ? {} : { detail } };
  return err;
};

/** Fill the form, then apply any overrides. `null` clears a field. */
function fill(overrides = {}) {
  const values = {
    'full name': 'Jane Smith',
    email: 'jane@co.com',
    'company (optional)': 'Acme Inc.',
    password: 'hunter2hunter2',
    'confirm password': 'hunter2hunter2',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    const field = screen.getByLabelText(new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`, 'i'));
    fireEvent.change(field, { target: { value: value ?? '' } });
  }
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: /^create account$/i }));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('the form can actually be filled', () => {
  it('finds all five fields by their label', () => {
    setup();
    for (const label of [/^full name$/i, /^email$/i, /^company \(optional\)$/i,
      /^password$/i, /^confirm password$/i]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('tells the browser what to autofill', () => {
    setup();
    expect(screen.getByLabelText(/^full name$/i).getAttribute('autocomplete')).toBe('name');
    expect(screen.getByLabelText(/^email$/i).getAttribute('autocomplete')).toBe('email');
    expect(screen.getByLabelText(/^company \(optional\)$/i).getAttribute('autocomplete')).toBe('organization');
    // new-password is what tells a password manager to offer a generated one.
    expect(screen.getByLabelText(/^password$/i).getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByLabelText(/^confirm password$/i).getAttribute('autocomplete')).toBe('new-password');
  });
});

describe('what it checks before sending anything', () => {
  it('reports the blank name even when the confirm also mismatches', async () => {
    // The ordering defect. Both problems are present; the name is the one the
    // user meets first on the form, so it is the one to report.
    //
    // Whitespace rather than an empty string on purpose: the field carries
    // `required`, so the browser blocks submission before any JS runs and a
    // truly empty name never reaches this guard. Spaces satisfy `required` and
    // fail `.trim()`, which is the only way the guard is reachable at all.
    const post = vi.spyOn(api, 'post');
    setup();
    fill({ 'full name': '   ', 'confirm password': 'something-else' });
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/full name/i);
    expect(alert.textContent).not.toMatch(/do not match/i);
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects a short password before contacting the server', async () => {
    const post = vi.spyOn(api, 'post');
    setup();
    fill({ password: 'short', 'confirm password': 'short' });
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/at least 8 characters/i);
    expect(post).not.toHaveBeenCalled();
  });

  it('catches a mistyped confirmation', async () => {
    const post = vi.spyOn(api, 'post');
    setup();
    fill({ 'confirm password': 'hunter2hunter3' });
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/do not match/i);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('creating the account', () => {
  it('trims the text fields and omits an empty company', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok);
    setup();
    fill({ 'full name': '  Jane Smith  ', email: ' jane@co.com ', 'company (optional)': null });
    submit();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/auth/register', {
      name: 'Jane Smith',
      email: 'jane@co.com',
      password: 'hunter2hunter2',
      // undefined rather than '', so the backend treats it as absent.
      company: undefined,
    });
  });

  it('signs you straight in', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(ok);
    setup();
    fill();
    submit();

    await waitFor(() => expect(screen.getByText(DASHBOARD)).toBeTruthy());
    expect(localStorage.getItem('resumate_hm_token')).toBe('access-1');
  });

  it('surfaces an address that is already registered', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(httpError(400, 'Email already registered'));
    setup();
    fill();
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/already registered/i);
    expect(screen.queryByText(DASHBOARD)).toBeNull();
  });

  it('says you are rate limited rather than that registration failed', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(httpError(429));
    setup();
    fill();
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/too many attempts/i);
  });
});
