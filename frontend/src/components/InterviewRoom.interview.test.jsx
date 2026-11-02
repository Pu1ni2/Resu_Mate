import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import InterviewRoom from './InterviewRoom';

/* The interview the video room asks the server to open. By the candidate's
 * address alone it took their newest interview, a later round if one had
 * been made, not the one they were entering. */

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

describe('the room the video interview opens', () => {
  it('is the room of the interview being entered', async () => {
    render(<InterviewRoom config={{ role: 'Dev', interview_id: 12 }} candidateName="Dana" candidateEmail="dana@x.com"
      onComplete={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/i understand and want to start/i));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /join interview/i })); });
    const asked = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/livekit/create-room'));
    expect(JSON.parse(asked[1].body).interview_id).toBe(12);
  });
});
