import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import useFocusChat from './useFocusChat';

/* The candidate file's chat, when the manager switches candidates while a
 * reply is still on its way. */

afterEach(() => {
  vi.restoreAllMocks();
});

const answer = (response, suggestions) => ({
  ok: true, status: 200, json: async () => ({ response, suggestions }),
});

describe('candidate chat requests', () => {
  it('drops the last candidate’s reply, and lets the new candidate’s conversation start', async () => {
    const pending = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const defaults = { apiBase: '', getCandidatePayload: () => ({}), speakText: vi.fn() };
    const { result, rerender } = renderHook(
      ({ candidate }) => useFocusChat({ ...defaults, focusCandidate: candidate }),
      { initialProps: { candidate: { id: 1 } } },
    );

    let first;
    act(() => { first = result.current.sendMessage('Summarize Ada'); });
    expect(result.current.isTyping).toBe(true);

    rerender({ candidate: { id: 2 } });
    act(() => { result.current.setMessages([]); });
    expect(result.current.isTyping).toBe(false);

    let second;
    act(() => { second = result.current.sendMessage('Summarize Grace'); });
    await act(async () => { pending[0](answer('Ada summary', ['Ada detail'])); await first; });
    expect(result.current.isTyping).toBe(true);
    expect(result.current.messages.some(m => m.content === 'Ada summary')).toBe(false);
    expect(result.current.suggestions).toEqual([]);

    await act(async () => { pending[1](answer('Grace summary')); await second; });
    expect(result.current.isTyping).toBe(false);
    expect(result.current.messages.at(-1).content).toBe('Grace summary');
  });
});
