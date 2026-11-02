import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Room } from 'livekit-client';

import InterviewRoom from './InterviewRoom';

/* The interview the video room asks the server to open, and how it ends. By
 * the candidate's address alone the server took their newest interview, a
 * later round if one had been made. And the room didn't notice the
 * interviewer closing it at the time limit. */

// A LiveKit room that keeps its handlers and, as LiveKit does, reports a
// disconnection when it is left.
vi.mock('livekit-client', () => {
  class Room {
    constructor() {
      Room.last = this;
      this.handlers = {};
      this.localParticipant = { setCameraEnabled: async () => {}, setMicrophoneEnabled: async () => {} };
    }
    on(event, handler) { this.handlers[event] = handler; return this; }
    async connect() {}
    disconnect() { this.handlers.disconnected?.(); }
  }
  return {
    Room,
    RoomEvent: { TrackSubscribed: 'trackSubscribed', ParticipantConnected: 'participantConnected', Disconnected: 'disconnected' },
    Track: { Kind: { Video: 'video', Audio: 'audio' } },
  };
});

let fetchMock;

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
    configurable: true,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ token: 't', livekit_url: 'wss://lk' }) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function goLive(onComplete = vi.fn()) {
  render(<InterviewRoom config={{ role: 'Dev', interview_id: 12 }} candidateName="Dana" candidateEmail="dana@x.com"
    onComplete={onComplete} onExit={vi.fn()} />);
  fireEvent.click(screen.getByLabelText(/i understand and want to start/i));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /join interview/i })); });
}

describe('the room the video interview opens', () => {
  it('is the room of the interview being entered', async () => {
    await goLive();
    const asked = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/livekit/create-room'));
    expect(JSON.parse(asked[1].body).interview_id).toBe(12);
  });
});

describe('how a video interview ends', () => {
  it('finishes when the interviewer closes the room at the time limit', async () => {
    const onComplete = vi.fn();
    await goLive(onComplete);
    act(() => { Room.last.handlers.disconnected(); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].terminated).toBe(false);
  });

  it('finishes once when the candidate ends it, though leaving reports a disconnection', async () => {
    const onComplete = vi.fn();
    await goLive(onComplete);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /end interview/i })); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
