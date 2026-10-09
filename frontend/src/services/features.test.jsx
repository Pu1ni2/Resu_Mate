import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';

import { getFeatures, resetFeatures, useAvatarInterviews } from './features';
import InterviewCreator from '../components/focus/InterviewCreator';

/* Avatar interviews need a worker the free hosting can't run. The forms offered
 * them anyway, and the server quietly ran voice instead. */

function serves(body, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok, json: async () => body });
}

beforeEach(() => {
  resetFeatures();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getFeatures', () => {
  it('asks the server once, however many ask', async () => {
    const spy = serves({ avatar_interviews: true });
    await Promise.all([getFeatures(), getFeatures()]);
    await getFeatures();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatch(/\/api\/features$/);
  });

  it('counts a server that can not answer as offering nothing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await getFeatures()).toEqual({});
  });
});

describe('useAvatarInterviews', () => {
  it('is true only when the server says so', async () => {
    serves({ avatar_interviews: true });
    const { result } = renderHook(() => useAvatarInterviews());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('stays false when the server says no, or answers with an error', async () => {
    serves({ avatar_interviews: false });
    const no = renderHook(() => useAvatarInterviews());
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(no.result.current).toBe(false);

    resetFeatures();
    vi.restoreAllMocks();
    serves({}, false);
    const broken = renderHook(() => useAvatarInterviews());
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(broken.result.current).toBe(false);
  });
});

describe('the interview creator', () => {
  const ada = { id: 1, name: 'Ada Lovelace', predicted_role: 'Engineer' };

  it('starts on voice and greys out avatars the server can not run', async () => {
    serves({ avatar_interviews: false });
    render(<InterviewCreator focusCandidate={ada} />);
    const avatar = screen.getByRole('button', { name: /avatar interview/i });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(avatar.disabled).toBe(true);
    expect(avatar.textContent).toMatch(/not set up on this server/i);
    expect(screen.getByRole('button', { name: /voice conversation/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('offers avatars when the server runs them', async () => {
    serves({ avatar_interviews: true });
    render(<InterviewCreator focusCandidate={ada} />);
    const avatar = screen.getByRole('button', { name: /avatar interview/i });
    await waitFor(() => expect(avatar.disabled).toBe(false));
    expect(avatar.textContent).toMatch(/lip-synced/i);
  });
});
