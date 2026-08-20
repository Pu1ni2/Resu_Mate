import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

import PipelineWizard from './PipelineWizard';

/* Screening had no tests at all, which is how it shipped with a run button that
 * could stick on "Screening..." forever: setFormRunning(false) existed only in
 * the catch, so a success left it disabled, and only the parent unmounting the
 * component hid the problem.
 */

const RESULT = {
  total_screened: 12,
  stats: { strong_fit: 3, good_fit: 5 },
  shortlist: [],
};

function mockRun(ok = true, body = RESULT) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => (ok ? body : { detail: 'Pipeline failed' }),
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('resumate_hm_token', 'test-token');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const setup = (props = {}) =>
  render(<PipelineWizard candidateCount={12} onComplete={props.onComplete || vi.fn()} />);

describe('what the screen offers', () => {
  it('goes straight to the form', () => {
    setup();
    expect(screen.getByText(/screen candidates/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/senior backend engineer/i)).toBeTruthy();
  });

  it('offers no voice mode', () => {
    // The wizard used to open on a mode picker. "Talk to AI Recruiter" collected
    // the same four fields by spoken question and was broken in six ways; the
    // form is the only path now.
    setup();
    expect(screen.queryByText(/talk to ai recruiter/i)).toBeNull();
    expect(screen.queryByText(/fill out a quick form/i)).toBeNull();
  });

  it('names the number of resumes on the button', () => {
    setup();
    expect(screen.getByRole('button', { name: /screen 12 resumes/i })).toBeTruthy();
  });
});

describe('the role is required', () => {
  it('the button is disabled until a role is typed', () => {
    setup();
    const btn = screen.getByRole('button', { name: /screen 12 resumes/i });
    expect(btn.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(/senior backend engineer/i),
      { target: { value: 'Backend Engineer' } });
    expect(btn.disabled).toBe(false);
  });

  it('whitespace is not a role', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(/senior backend engineer/i),
      { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /screen 12 resumes/i }).disabled).toBe(true);
  });
});

describe('running it', () => {
  it('posts the four fields and hands the result to onComplete', async () => {
    const spy = mockRun();
    const onComplete = vi.fn();
    setup({ onComplete });

    fireEvent.change(screen.getByPlaceholderText(/senior backend engineer/i),
      { target: { value: 'Backend Engineer' } });
    fireEvent.change(screen.getByPlaceholderText(/python, react, aws/i),
      { target: { value: 'Python, AWS' } });
    fireEvent.click(screen.getByRole('button', { name: /screen 12 resumes/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(RESULT));

    const body = JSON.parse(spy.mock.calls[0][1].body);
    expect(body.role).toBe('Backend Engineer');
    // Comma-separated skills arrive as an array, trimmed.
    expect(body.required_skills).toEqual(['Python', 'AWS']);
    expect(body.min_experience_years).toBe(0);
    expect(body.jd_text).toBeNull();
  });

  it('announces completion to the notification bell', async () => {
    mockRun();
    const heard = vi.fn();
    window.addEventListener('resumate:notify', heard);
    setup();

    fireEvent.change(screen.getByPlaceholderText(/senior backend engineer/i),
      { target: { value: 'Backend Engineer' } });
    fireEvent.click(screen.getByRole('button', { name: /screen 12 resumes/i }));

    // This notification used to live only on the deleted voice path.
    await waitFor(() => expect(heard).toHaveBeenCalled());
    window.removeEventListener('resumate:notify', heard);
    const { title, body } = heard.mock.calls[0][0].detail;
    expect(title).toMatch(/screening complete/i);
    expect(body).toContain('12');
    expect(body).toContain('Backend Engineer');
  });

  it('re-enables the button after a successful run', async () => {
    // The actual defect. setFormRunning(false) lived only in the catch, so a
    // success left the button disabled on "Screening 12 resumes..." forever. In
    // the app the parent immediately swaps in the results view, which hid it --
    // here the component stays mounted, so the state is visible.
    mockRun();
    const onComplete = vi.fn();
    setup({ onComplete });

    fireEvent.change(screen.getByPlaceholderText(/senior backend engineer/i),
      { target: { value: 'Backend Engineer' } });
    fireEvent.click(screen.getByRole('button', { name: /screen 12 resumes/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    const btn = screen.getByRole('button', { name: /screen 12 resumes/i });
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).not.toMatch(/screening 12 resumes/i);
  });

  it('survives a result with no stats block', async () => {
    // The bell message reads data.stats; a run that returns without one must not
    // throw on the way to the results view.
    mockRun(true, { total_screened: 4, shortlist: [] });
    const onComplete = vi.fn();
    setup({ onComplete });

    fireEvent.change(screen.getByPlaceholderText(/senior backend engineer/i),
      { target: { value: 'Dev' } });
    fireEvent.click(screen.getByRole('button', { name: /screen 12 resumes/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});

describe('when the run fails', () => {
  it('shows the error and makes the button clickable again', async () => {
    mockRun(false);
    const onComplete = vi.fn();
    const toasts = vi.fn();
    window.addEventListener('resumate:toast', toasts);
    setup({ onComplete });

    fireEvent.change(screen.getByPlaceholderText(/senior backend engineer/i),
      { target: { value: 'Backend Engineer' } });
    const btn = screen.getByRole('button', { name: /screen 12 resumes/i });
    fireEvent.click(btn);

    await waitFor(() => expect(toasts).toHaveBeenCalled());
    window.removeEventListener('resumate:toast', toasts);

    expect(toasts.mock.calls[0][0].detail.type).toBe('error');
    expect(onComplete).not.toHaveBeenCalled();
    // The stuck-spinner case. Before the fix the reset lived only in the catch,
    // so this passed for a failure and would have failed for a success.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /screen 12 resumes/i }).disabled).toBe(false);
    });
  });

  it('a network rejection is handled too, not just a bad status', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const toasts = vi.fn();
    window.addEventListener('resumate:toast', toasts);
    setup();

    fireEvent.change(screen.getByPlaceholderText(/senior backend engineer/i),
      { target: { value: 'Dev' } });
    fireEvent.click(screen.getByRole('button', { name: /screen 12 resumes/i }));

    await waitFor(() => expect(toasts).toHaveBeenCalled());
    window.removeEventListener('resumate:toast', toasts);
    expect(toasts.mock.calls[0][0].detail.message).toMatch(/offline/i);
  });
});
