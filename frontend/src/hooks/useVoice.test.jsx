import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import useVoice from './useVoice';

/* Reading a reply aloud opened the microphone, to hear the listener interrupt,
 * every time: for Jarvis before anyone had asked it to listen, and for the
 * candidate file's Read aloud, where nothing listened for an interruption. */

let getUserMedia;

beforeEach(() => {
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  // The spoken reply: some audio, that plays and never ends here.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['audio']) });
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:reply');
  globalThis.URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('Audio', class {
    play() { return Promise.resolve(); }
    pause() {}
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function readAloud(options) {
  const { result } = renderHook(() => useVoice({ apiBase: '', ...options }));
  await act(async () => { result.current.speakText('Hello there.', 0); });
  await waitFor(() => expect(result.current.speakingMsgIndex).toBe(0));
  // Long enough for the microphone to have been asked for, if it would be.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}

describe('reading aloud', () => {
  it('opens no microphone for a caller that listens for no interruption', async () => {
    await readAloud({});
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('opens none while the caller says it is not listening', async () => {
    await readAloud({ onBargeIn: vi.fn(), listenWhileSpeaking: () => false });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('opens it to hear an interruption while the caller is listening', async () => {
    await readAloud({ onBargeIn: vi.fn(), listenWhileSpeaking: () => true });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
