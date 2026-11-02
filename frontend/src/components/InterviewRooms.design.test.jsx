import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';

import ConversationalInterviewRoom from './ConversationalInterviewRoom';
import InterviewRoom from './InterviewRoom';

/* The interview rooms in the Studio design, with none of the old dark room's
 * styles written into the page. What they say stays true to what they do:
 * the voice room says the interview is saved, not recorded, and the video
 * room claims no camera or microphone before either is on, and lists only
 * what it counts. */

// The browser's connection to the realtime interviewer, as far as the room uses it.
class FakePeer {
  constructor() {
    FakePeer.last = this;
    this.iceConnectionState = 'new';
  }
  addTrack() {}
  createDataChannel() {
    this.channel = {
      sent: [],
      send(data) { this.sent.push(JSON.parse(data)); },
      close() {},
    };
    return this.channel;
  }
  async createOffer() { return { type: 'offer', sdp: 'offer' }; }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  close() {}
}

const reply = body => ({
  ok: true, status: 200,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [], getAudioTracks: () => [] }) },
    configurable: true,
  });
  vi.stubGlobal('RTCPeerConnection', FakePeer);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    const path = String(url);
    if (path.endsWith('/api/realtime/session')) return reply({ client_secret: 'secret', model: 'gpt-realtime', remaining_minutes: 20 });
    if (path.includes('api.openai.com')) return reply('answer');
    return reply({});
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Styles written into the page, but for the hidden audio and the sculpture's
// column heights, which come from the component.
const inlineStyles = room => [...room.querySelectorAll('[style]')]
  .filter(el => el.tagName !== 'AUDIO' && !el.closest('.sc-conversation'));

describe('the voice interview room', () => {
  const onComplete = vi.fn();
  const open = () => render(
    <ConversationalInterviewRoom interviewId={5} candidateName="Dana" candidateEmail="dana@x.com" onComplete={onComplete} onExit={vi.fn()} />,
  ).container.querySelector('.studio-interview.studio-voice-room');

  async function goLive() {
    const room = open();
    fireEvent.click(screen.getByLabelText(/i understand and want to start/i));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start interview/i })); });
    const peer = FakePeer.last;
    act(() => { peer.iceConnectionState = 'connected'; peer.oniceconnectionstatechange(); });
    expect(screen.getByRole('heading', { name: 'Listening…' })).toBeTruthy();
    return room;
  }

  const say = event => act(() => { FakePeer.last.channel.onmessage({ data: JSON.stringify(event) }); });

  it('welcomes the candidate in the Studio design, with nothing styled into the page', () => {
    const room = open();
    expect(within(room).getByText('ResuMate · Voice interview')).toBeTruthy();
    expect(within(room).getByText('Hi Dana')).toBeTruthy();
    expect(room.querySelector('.sc-conversation[data-variant="welcome"]').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('group', { name: 'Before you start' }).classList.contains('studio-interview-consent')).toBe(true);
    expect(inlineStyles(room)).toEqual([]);
  });

  it('shows who is speaking beside the transcript while live', async () => {
    const room = await goLive();
    const sculpture = room.querySelector('.sc-conversation[data-variant="live"]');
    expect(sculpture.dataset.live).toBe('true');
    const transcript = within(screen.getByRole('region', { name: 'Live transcript' }));
    expect(transcript.getByText('Conversation will appear here as you talk…')).toBeTruthy();

    say({ type: 'output_audio_buffer.started' });
    expect(screen.getByRole('heading', { name: 'Alex is speaking…' })).toBeTruthy();
    expect(sculpture.dataset.speaking).toBe('true');
    say({ type: 'response.audio_transcript.done', transcript: 'Tell me about a project you led.' });
    expect(transcript.getByText('Tell me about a project you led.')).toBeTruthy();
    expect(transcript.getByText('Alex')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mute' })).toBeTruthy();
    expect(inlineStyles(room)).toEqual([]);
  });

  // The beta's address, /v1/realtime?model=, refuses an offer since OpenAI
  // retired the beta, and no voice interview could start.
  it("connects at OpenAI's current address, with the session's key", async () => {
    await goLive();
    const calls = fetch.mock.calls.filter(([url]) => String(url).includes('api.openai.com'));
    expect(calls.map(([url]) => url)).toEqual(['https://api.openai.com/v1/realtime/calls']);
    const [, sent] = calls[0];
    expect(sent.method).toBe('POST');
    expect(sent.body).toBe('offer');
    expect(sent.headers).toEqual({ Authorization: 'Bearer secret', 'Content-Type': 'application/sdp' });
  });

  // The current API's name for the event; listening only for the beta's kept
  // none of the interviewer's questions.
  it("keeps the interviewer's lines under the current API's name for them, and the beta's", async () => {
    await goLive();
    const transcript = within(screen.getByRole('region', { name: 'Live transcript' }));
    say({ type: 'response.output_audio_transcript.done', transcript: 'What drew you to this role?' });
    expect(transcript.getByText('What drew you to this role?')).toBeTruthy();
    say({ type: 'response.audio_transcript.done', transcript: 'And what would you change first?' });
    expect(transcript.getByText('And what would you change first?')).toBeTruthy();
    expect(transcript.getAllByText('Alex')).toHaveLength(2);
  });

  // The model answers only when asked: with nothing sent, the candidate
  // heard silence until they spoke.
  it('asks the interviewer to begin once the line is open, and only once', async () => {
    await goLive();
    const channel = FakePeer.last.channel;
    expect(channel.sent).toEqual([]);
    channel.onopen();
    expect(channel.sent).toEqual([{ type: 'response.create' }]);
  });

  it("writes what OpenAI refused to the console, by its code and words", async () => {
    await goLive();
    say({ type: 'error', error: { type: 'invalid_request_error', code: 'invalid_value', message: 'Unknown parameter' } });
    expect(console.warn).toHaveBeenCalledWith('interviewer error:', 'invalid_value', 'Unknown parameter');
  });

  it('says when the connection is lost, and while it is coming back', async () => {
    await goLive();
    const peer = FakePeer.last;
    act(() => { peer.iceConnectionState = 'disconnected'; peer.oniceconnectionstatechange(); });
    const lost = screen.getByRole('alert');
    expect(lost.textContent).toMatch(/connection to the interviewer was lost/i);
    expect(lost.classList.contains('si-notice')).toBe(false);
    act(() => { peer.iceConnectionState = 'checking'; peer.oniceconnectionstatechange(); });
    expect(screen.getByRole('alert').textContent).toBe('Reconnecting to the interviewer…');
    expect(screen.getByRole('alert').classList.contains('si-notice')).toBe(true);
  });

  it('says the interview has been saved, not recorded, once it ends', async () => {
    const room = await goLive();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'End interview' })); });
    expect(screen.getByRole('heading', { name: 'Thanks for talking with us' })).toBeTruthy();
    expect(within(room).getByText(/your interview has been saved/i)).toBeTruthy();
    expect(room.textContent).not.toMatch(/recorded/i);
    expect(onComplete).toHaveBeenCalled();
  });
});

describe('the video interview room', () => {
  const open = (config = { role: 'Dev', num_questions: 5 }) => render(
    <InterviewRoom config={config} candidateName="Dana" candidateEmail="dana@x.com" onComplete={vi.fn()} onExit={vi.fn()} />,
  ).container.querySelector('.studio-interview.studio-avatar-room');

  it('welcomes the candidate in the Studio design, with nothing styled into the page', () => {
    const room = open();
    expect(within(room).getByText('ResuMate · Video interview')).toBeTruthy();
    expect(within(room).getByText('Hi Dana')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Before you start' }).classList.contains('studio-interview-consent')).toBe(true);
    expect(inlineStyles(room)).toEqual([]);
  });

  it('claims no camera or microphone before either is on', () => {
    const room = open();
    expect(within(room).queryByText(/camera on|microphone ready/i)).toBeNull();
  });

  it('lists what it counts, with no eye tracking it does not do', () => {
    const room = open();
    const rules = within(room.querySelector('.si-proctoring'));
    expect(rules.getByText('Proctored: 3 violations end the interview')).toBeTruthy();
    expect(rules.getByText('Your face is checked to stay in view')).toBeTruthy();
    expect(rules.getByText('Switching tabs or windows, or leaving full screen, is a violation')).toBeTruthy();
    expect(room.textContent).not.toMatch(/\beye|gaze/i);
  });

  it('gives the role and the number of questions only when it has them', () => {
    let room = open();
    const details = within(room.querySelector('.si-interview-details'));
    expect(details.getByText('Dev')).toBeTruthy();
    expect(details.getByText('5 Qs')).toBeTruthy();
    room.parentElement.remove();
    room = open({});
    expect(room.querySelector('.si-interview-details')).toBeNull();
  });
});
