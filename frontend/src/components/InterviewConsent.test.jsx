import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import ConversationalInterviewRoom from './ConversationalInterviewRoom';
import InterviewRoom from './InterviewRoom';

/* An interview began, recorded and scored by AI, without the candidate being
 * told so first. Both rooms now say what happens and wait for their say-so,
 * and tell the server they gave it. */

let refusal;

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [], getAudioTracks: () => [] }) },
    configurable: true,
  });
  refusal = { status: 400, detail: 'refused' };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: false, status: refusal.status,
    text: async () => refusal.detail, json: async () => ({ detail: refusal.detail }),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const agree = () => fireEvent.click(screen.getByLabelText(/i understand and want to start/i));
const sentTo = path => globalThis.fetch.mock.calls.filter(([url]) => String(url).endsWith(path));

describe('the voice interview', () => {
  const room = () => render(
    <ConversationalInterviewRoom interviewId={5} candidateName="Dana" candidateEmail="dana@x.com" onComplete={vi.fn()} onExit={vi.fn()} />,
  );

  it('says what happens, and waits for the candidate to agree', () => {
    room();
    expect(screen.getByText(/what you say is transcribed and saved/i)).toBeTruthy();
    expect(screen.getByText(/ai scores your answers/i)).toBeTruthy();
    expect(screen.queryByText(/your camera is used/i)).toBeNull();
    const start = screen.getByRole('button', { name: /start interview/i });
    expect(start.disabled).toBe(true);
    agree();
    expect(start.disabled).toBe(false);
  });

  it('tells the server the candidate agreed', async () => {
    room();
    agree();
    fireEvent.click(screen.getByRole('button', { name: /start interview/i }));
    await waitFor(() => expect(sentTo('/api/realtime/session')).toHaveLength(1));
    expect(JSON.parse(sentTo('/api/realtime/session')[0][1].body)).toEqual({
      interview_id: 5, candidate_email: 'dana@x.com', consent: true,
    });
  });
});

describe('the video interview', () => {
  const room = () => render(
    <InterviewRoom config={{ role: 'Dev', num_questions: 5 }} candidateName="Dana" candidateEmail="dana@x.com" onComplete={vi.fn()} onExit={vi.fn()} />,
  );

  it('also says the camera checks they stay in view', () => {
    room();
    expect(screen.getByText(/your camera is used to check you stay in view/i)).toBeTruthy();
    const join = screen.getByRole('button', { name: /join interview/i });
    expect(join.disabled).toBe(true);
    agree();
    expect(join.disabled).toBe(false);
  });

  it("tells the server the candidate agreed, and shows the server's reason for a refusal", async () => {
    refusal = { status: 409, detail: 'This interview is already complete.' };
    room();
    agree();
    fireEvent.click(screen.getByRole('button', { name: /join interview/i }));
    expect(await screen.findByText('This interview is already complete.')).toBeTruthy();
    expect(JSON.parse(sentTo('/api/livekit/create-room')[0][1].body).consent).toBe(true);
  });
});
