import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import InterviewRoom from './InterviewRoom';
import { NO_CHECKS, faceInView, recordCheck, shareInView } from './shared/faceInView';

/* "Face in view", as the video room reports it when the interview ends. The
 * room took the face's place from the camera's own picture, 1280 wide, and
 * compared it with the middle of the smaller picture on screen: a centred face
 * read as off to the side at every check, and a test interview was reported
 * as 0% in view, with 236 looks away in 2:23. */

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

const CAMERA = 1280; // the camera's own picture
const ON_SCREEN = 600; // the tile it's shown in

// A face found with its centre `centre` across the camera's own picture.
const found = centre => ({
  detection: { box: { x: centre - 100, y: 200, width: 200, height: 260 } },
  landmarks: { getLeftEye: () => [], getRightEye: () => [] },
});

let faces = [];

beforeEach(() => {
  faces = [];
  window.faceapi = {
    TinyFaceDetectorOptions: class {},
    detectAllFaces: () => ({ withFaceLandmarks: async () => faces }),
    // As face-api does: the same faces, in the size asked for.
    resizeResults: (dets, { width }) => dets.map(d => {
      const k = width / CAMERA;
      const b = d.detection.box;
      return { ...d, detection: { box: { x: b.x * k, y: b.y * k, width: b.width * k, height: b.height * k } } };
    }),
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
    configurable: true,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(ON_SCREEN);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(338);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect() {}, strokeRect() {}, setLineDash() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {},
  });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ token: 't', livekit_url: 'wss://lk' }) });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterEach(() => {
  delete window.faceapi;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Takes the interview with a face at each place in turn (null: no face
// found), one check each, then ends it and gives what the room reported.
async function interview(places) {
  const onComplete = vi.fn();
  render(<InterviewRoom config={{ role: 'Dev' }} candidateName="Dana" candidateEmail="dana@x.com" onComplete={onComplete} onExit={vi.fn()} />);
  fireEvent.click(screen.getByLabelText(/i understand and want to start/i));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /join interview/i })); });
  for (const place of places) {
    faces = place === null ? [] : [found(place)];
    await act(async () => { vi.advanceTimersByTime(600); });
  }
  fireEvent.click(screen.getByRole('button', { name: /end interview/i }));
  expect(onComplete).toHaveBeenCalledTimes(1);
  return onComplete.mock.calls[0][0];
}

describe('face in view, as the video room reports it', () => {
  it('finds a centred face in view at every check', async () => {
    const reported = await interview([640, 640, 640, 640, 640]);
    expect(reported.eyeContact).toBe(100);
    expect(reported.lookAwayCount).toBe(0);
  });

  it('counts each time the face left once, and checks with no face as out of view', async () => {
    // In, gone for two checks, back, off to the side, back.
    const reported = await interview([640, null, null, 640, 120, 640]);
    expect(reported.eyeContact).toBe(50);
    expect(reported.lookAwayCount).toBe(2);
  });
});

describe('the checks themselves', () => {
  it('take the face and the picture in the same size', () => {
    expect(faceInView({ x: 250, width: 100 }, ON_SCREEN)).toBe(true);
    expect(faceInView({ x: 20, width: 100 }, ON_SCREEN)).toBe(false);
    expect(faceInView(undefined, ON_SCREEN)).toBe(false);
  });

  it('give no share when no check was made, rather than 0%', () => {
    expect(shareInView(NO_CHECKS)).toBeNull();
    expect(shareInView([true, false, true, true].reduce(recordCheck, NO_CHECKS))).toBe(75);
  });
});
