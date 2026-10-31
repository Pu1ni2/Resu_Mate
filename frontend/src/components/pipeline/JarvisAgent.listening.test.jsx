import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import JarvisAgent from './JarvisAgent';

/* Jarvis turned the microphone on by itself, once its greeting was spoken and
 * after each reply to a typed message. Hands-free starts off now: it listens
 * once the manager presses the orb, and from then on until they press it
 * again. */

const voice = vi.hoisted(() => ({ options: null, startRecording: null }));
vi.mock('../../hooks/useVoice', () => ({
  default: options => {
    voice.options = options;
    return {
      isRecording: false, isTranscribing: false, speakingMsgIndex: null,
      speakText: async () => {}, startRecording: voice.startRecording, stopRecording: () => {}, stopSpeaking: () => {},
    };
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  voice.startRecording = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ reply: 'Okay.', action: null }) });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const open = () => render(<JarvisAgent candidatesSummary={[{ id: 1, name: 'Dana' }]} onClose={vi.fn()} onComplete={vi.fn()} />);

// Jarvis has finished saying something; what does it do next?
const doneSpeaking = () => act(() => { voice.options.onSpeakingDone(); vi.advanceTimersByTime(2000); });

describe('Jarvis listens only when asked', () => {
  it('opens no microphone after its greeting, nor while it speaks', () => {
    open();
    act(() => { vi.advanceTimersByTime(1000); });
    doneSpeaking();
    expect(voice.startRecording).not.toHaveBeenCalled();
    expect(voice.options.listenWhileSpeaking()).toBe(false);
  });

  it('opens none after the reply to a typed message', async () => {
    open();
    const input = screen.getByLabelText('Message Jarvis');
    fireEvent.change(input, { target: { value: 'Who is strongest?' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // The reply arrives, and Jarvis has finished with it.
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByText('Okay.')).toBeTruthy();
    doneSpeaking();
    expect(voice.startRecording).not.toHaveBeenCalled();
  });

  it('listens once the manager presses the orb, and keeps listening after each reply', () => {
    open();
    // The orb, and the mic beside the message field, both start it.
    const [orb] = screen.getAllByRole('button', { name: 'Start listening' });
    fireEvent.click(orb);
    expect(voice.startRecording).toHaveBeenCalledTimes(1);
    expect(voice.options.listenWhileSpeaking()).toBe(true);
    doneSpeaking();
    expect(voice.startRecording).toHaveBeenCalledTimes(2);
  });
});
