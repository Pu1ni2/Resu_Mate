import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import HiringLogin from './HiringLogin';
import { AppProvider } from '../../context/AppContext';
import api from '../../services/api';

/* The front door, and until recently it had no tests and did not render.
 *
 * Two defects these pin down:
 *   - Seven inputs across the two auth pages had no autoComplete and no label
 *     association, so password managers did nothing and every field was
 *     nameless to a screen reader.
 *   - The endpoint is rate limited to 5/minute and a 429 carries no `detail`,
 *     so being throttled was reported as "Invalid email or password" — which
 *     invites the user to try again and stay throttled.
 *
 * AppProvider is used for real rather than mocked: its backend sync is guarded
 * on `hiringManager`, which is seeded from localStorage, so a logged-out render
 * makes no network call.
 */

const DASHBOARD = 'dashboard-reached';

function setup() {
  return render(
    <MemoryRouter initialEntries={['/hiring/login']}>
      <AppProvider>
        <Routes>
          <Route path="/hiring/login" element={<HiringLogin />} />
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
    user: { id: 1, email: 'jane@co.com', name: 'Jane' },
  },
};

/** An axios-shaped rejection. */
const httpError = (status, detail) => {
  const err = new Error('request failed');
  err.response = { status, data: detail === undefined ? {} : { detail } };
  return err;
};

const fill = () => {
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'jane@co.com' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'hunter2hunter2' } });
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('the form can actually be filled', () => {
  it('finds both fields by their label', () => {
    setup();
    // getByLabelText only resolves through htmlFor/id, so this passing IS the
    // proof the pairing is real. Both labels were unassociated before.
    expect(screen.getByLabelText(/^email$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
  });

  it('tells the browser what to autofill', () => {
    setup();
    expect(screen.getByLabelText(/^email$/i).getAttribute('autocomplete')).toBe('email');
    expect(screen.getByLabelText(/^password$/i).getAttribute('autocomplete')).toBe('current-password');
  });

  it('names the password toggle and reports its state', () => {
    setup();
    const toggle = screen.getByRole('button', { name: /show password/i });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);
    const hide = screen.getByRole('button', { name: /hide password/i });
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    // And the field actually reveals.
    expect(screen.getByLabelText(/^password$/i).getAttribute('type')).toBe('text');
  });
});

describe('signing in', () => {
  it('posts the credentials and lands on the dashboard', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok);
    setup();
    fill();
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByText(DASHBOARD)).toBeTruthy());
    expect(post).toHaveBeenCalledWith('/auth/login', {
      email: 'jane@co.com',
      password: 'hunter2hunter2',
    });
  });

  it('stores the session so a reload stays signed in', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(ok);
    setup();
    fill();
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(localStorage.getItem('resumate_hm_token')).toBe('access-1'));
    expect(localStorage.getItem('resumate_hm_refresh')).toBe('refresh-1');
    expect(JSON.parse(localStorage.getItem('resumate_hm_user')).email).toBe('jane@co.com');
  });
});

describe('when it fails', () => {
  it('shows the server message in something a screen reader announces', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(httpError(401, 'Invalid email or password'));
    setup();
    fill();
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    // role="alert" is the part that matters — the error used to be a plain div
    // that mounted silently.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/invalid email or password/i);
  });

  it('says you are rate limited rather than blaming the password', async () => {
    // slowapi answers 429 with no detail field, which is why the old
    // `detail || fallback` reported a credential problem.
    vi.spyOn(api, 'post').mockRejectedValue(httpError(429));
    setup();
    fill();
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/too many attempts/i);
    expect(alert.textContent).not.toMatch(/invalid email or password/i);
  });

  it('distinguishes an unreachable server from a rejected credential', async () => {
    const offline = new Error('Network Error');   // axios: no response property
    vi.spyOn(api, 'post').mockRejectedValue(offline);
    setup();
    fill();
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/could not reach the server/i);
  });

  it('leaves the button usable so you can try again', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(httpError(401, 'Invalid email or password'));
    setup();
    fill();
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: /^sign in$/i }).disabled).toBe(false);
    expect(screen.queryByText(DASHBOARD)).toBeNull();
  });
});
