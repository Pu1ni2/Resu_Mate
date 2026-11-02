import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import InterviewRoom from './InterviewRoom';

/* Leaving a video interview, as the room counts it. One tab switch reaches it
 * as two or three signals at once, the window's focus lost, the tab hidden
 * and, from full screen, full screen left, and each was counted: one switch
 * made two of the three violations that end the interview, or all three. */

vi.mock('livekit-client', () => {
  class Room {
    constructor() {
      this.localParticipant = { setCameraEnabled: async () => {}, setMicrophoneEnabled: async () => {} };
    }
    on() { return this; }
    async connect() {}
    disconnect() {}
  }
  return {
    Room,
    RoomEvent: { TrackSubscribed: 'trackSubscribed', ParticipantConnected: 'participantConnected' },
    Track: { Kind: { Video: 'video', Audio: 'audio' } },
  };
});

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
    configurable: true,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ token: 't', livekit_url: 'wss://lk' }) });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
});

afterEach(() => {
  delete document.hidden;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function goLive() {
  render(<InterviewRoom config={{ role: 'Dev' }} candidateName="Dana" candidateEmail="dana@x.com" onComplete={vi.fn()} onExit={vi.fn()} />);
  fireEvent.click(screen.getByLabelText(/i understand and want to start/i));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /join interview/i })); });
  expect(screen.getByText('0/3')).toBeTruthy();
}

// A tab switch from full screen, as the browser reports it.
function switchTabs() {
  fireEvent.blur(window);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  fireEvent(document, new Event('visibilitychange'));
  fireEvent(document, new Event('fullscreenchange'));
}

describe('leaving a video interview', () => {
  it('counts one tab switch once, though the browser signals it three ways', async () => {
    await goLive();
    act(() => { switchTabs(); });
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('counts the next departure too', async () => {
    await goLive();
    act(() => { fireEvent.blur(window); });
    act(() => {
      vi.setSystemTime(Date.now() + 5000);
      fireEvent.blur(window);
    });
    expect(screen.getByText('2/3')).toBeTruthy();
  });
});
