import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import ConversationalInterviewRoom from './ConversationalInterviewRoom';
import InterviewRoom from './InterviewRoom';

/* Why an interview couldn't start, in plain words by the step that failed.
 * The rooms showed the browser's, LiveKit's or OpenAI's own text, such as
 * "Session mint failed (502): {…}", with hints about "OpenAI Realtime" and
 * "LiveKit credentials". */

const SECRET = 'raw words from deep inside';

class FakePeer {
  addTrack() {}
  createDataChannel() { return { close() {} }; }
  async createOffer() { return { type: 'offer', sdp: 'offer' }; }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  close() {}
}

const reply = (body, status = 200) => ({
  ok: status < 400, status,
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

let devices;
let answers;

beforeEach(() => {
  devices = vi.fn().mockResolvedValue({ getTracks: () => [], getAudioTracks: () => [] });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: devices }, configurable: true });
  vi.stubGlobal('RTCPeerConnection', FakePeer);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  answers = {};
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    const path = String(url);
    const answer = Object.entries(answers).find(([part]) => path.includes(part));
    if (answer) return answer[1]();
    return reply({});
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const blocked = () => Object.assign(new Error(SECRET), { name: 'NotAllowedError' });
const missing = () => Object.assign(new Error(SECRET), { name: 'NotFoundError' });
const unreachable = () => { throw new TypeError('Failed to fetch'); };

async function startVoice() {
  render(<ConversationalInterviewRoom interviewId={5} candidateName="Dana" candidateEmail="dana@x.com" onComplete={vi.fn()} onExit={vi.fn()} />);
  fireEvent.click(screen.getByLabelText(/i understand and want to start/i));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start interview/i })); });
  return screen.getByRole('alert');
}

async function startVideo() {
  render(<InterviewRoom config={{ role: 'Dev' }} candidateName="Dana" candidateEmail="dana@x.com" onComplete={vi.fn()} onExit={vi.fn()} />);
  fireEvent.click(screen.getByLabelText(/i understand and want to start/i));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /join interview/i })); });
  return screen.getByRole('alert');
}

const says = (alert, message, hint) => {
  expect(alert.textContent).toBe(`${message}${hint}`);
  expect(alert.textContent).not.toMatch(new RegExp(`${SECRET}|Failed to fetch|LiveKit|OpenAI|Session mint|SDP`, 'i'));
};

describe('a voice interview that cannot start', () => {
  it('says the microphone is blocked', async () => {
    devices.mockRejectedValue(blocked());
    says(await startVoice(), 'Your microphone is blocked for this site.', 'Allow microphone access in your browser settings, then try again.');
  });

  it('says no microphone could be used', async () => {
    devices.mockRejectedValue(missing());
    says(await startVoice(), 'No microphone could be used.', 'Check that one is connected and not in use by another app, then try again.');
  });

  it("gives our server's reason when it refuses", async () => {
    answers['/api/realtime/session'] = () => reply({ detail: 'This interview is already complete.' }, 409);
    says(await startVoice(), 'This interview is already complete.', 'If it keeps happening, contact your hiring manager.');
  });

  it('says the interview server is out of reach', async () => {
    answers['/api/realtime/session'] = unreachable;
    says(await startVoice(), 'Couldn’t reach the interview server.', 'Check your connection and try again.');
  });

  it("says the interviewer didn't connect, without OpenAI's reply", async () => {
    answers['/api/realtime/session'] = () => reply({ client_secret: 'secret', model: 'gpt-realtime' });
    answers['api.openai.com'] = () => reply(SECRET, 500);
    says(await startVoice(), 'Couldn’t connect to the interviewer.', 'Check your connection and try again.');
  });
});

describe('a video interview that cannot start', () => {
  it('says the camera or microphone is blocked', async () => {
    devices.mockRejectedValue(blocked());
    says(await startVideo(), 'Your camera or microphone is blocked for this site.', 'Allow both in your browser settings, then try again.');
  });

  it("gives our server's reason when it refuses", async () => {
    answers['/api/livekit/create-room'] = () => reply({ detail: 'This interview is already complete.' }, 409);
    says(await startVideo(), 'This interview is already complete.', 'If it keeps happening, contact your hiring manager.');
  });

  it("says video isn't available, without blaming credentials", async () => {
    answers['/api/livekit/create-room'] = () => reply({});
    says(await startVideo(), 'The video interview isn’t available right now.', 'Contact your hiring manager.');
  });

  it('says the interview server is out of reach', async () => {
    answers['/api/livekit/create-room'] = unreachable;
    says(await startVideo(), 'Couldn’t reach the interview server.', 'Check your connection and try again.');
  });
});
