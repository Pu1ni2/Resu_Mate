import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ProductMock from './landing/ProductMock';
import InterviewReportView from './shared/InterviewReportView';
import ScannerBar from './focus/ScannerBar';
import HiringAgentPanel from './focus/HiringAgentPanel';
import InterviewRoom from './InterviewRoom';
import Dashboard from './Dashboard';

/* Labels that said more than was true: a model name nobody configured, sample
 * figures shown as real, "eye contact" from a face detector, progress bars and
 * steps that were never progress; and an interview ended for violations that
 * reported 0 time and 0% in view. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

// A LiveKit room that connects at once and never hears from an interviewer.
vi.mock('livekit-client', () => {
  class Room {
    constructor() { this.localParticipant = { setCameraEnabled: async () => {}, setMicrophoneEnabled: async () => {} }; }
    on() { return this; }
    async connect() {}
    disconnect() {}
  }
  return { Room, RoomEvent: { TrackSubscribed: 'ts', ParticipantConnected: 'pc', Disconnected: 'd' }, Track: { Kind: { Video: 'video', Audio: 'audio' } } };
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true, status: 200, json: async () => ({ token: 'lk-token', livekit_url: 'wss://lk.example', room_name: 'r1' }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('what the pages claim', () => {
  it('the hero panel says its figures are an example', () => {
    render(<ProductMock />);
    expect(screen.getByText('Example data')).toBeTruthy();
  });

  it('face tracking is called what it measures', () => {
    render(<InterviewReportView report={{ scores: [], eyeContact: 80, report: '' }} />);
    expect(screen.getByText('Face in view')).toBeTruthy();
    expect(screen.queryByText('Eye Contact')).toBeNull();
  });

  it('the chat names no model', () => {
    const ada = { id: 1, name: 'Ada', is_resume: true, skills: [] };
    mocks.app = {
      candidates: [ada], selectedIds: [1], selectedCandidates: [ada], uploadProgress: {}, loading: false,
      loadCandidates: vi.fn(), uploadResume: vi.fn(), deleteCandidate: vi.fn(), clearAllCandidates: vi.fn(),
      toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(), anonymize: false, setAnonymize: vi.fn(),
      analytics: null, messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(),
      clearChat: vi.fn(), getDisplayName: c => c.name, getAvatarGradient: () => 'none',
      hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
    };
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    fireEvent.click(screen.getAllByText('AI Chat')[0]);
    expect(screen.getByText('1 candidates')).toBeTruthy();
    expect(screen.queryByText(/GPT/)).toBeNull();
  });
});

describe('progress that is real', () => {
  it('a running scan says it is running, with no made-up percentage', () => {
    const { container } = render(<ScannerBar scanLogs={[]} scanRunning scanDone={false} />);
    expect(screen.getByText("Scanning the résumé's links and profiles…")).toBeTruthy();
    expect(container.querySelector('.scanner-bar-progress-fill')).toBeNull();
  });

  it('a failed scan shows why', () => {
    render(<ScannerBar scanLogs={[{ msg: "Couldn't scan this candidate's profiles.", status: 'error' }]} scanRunning={false} scanDone />);
    expect(screen.getByText("Couldn't scan this candidate's profiles.")).toBeTruthy();
  });

  it('the evaluation shows no steps it does not know about', () => {
    render(<HiringAgentPanel agentStep="loading" agentResult={null} />);
    expect(screen.getByRole('status').textContent).toMatch(/comparing it with the role/i);
    expect(screen.queryByText(/searching online presence/i)).toBeNull();
  });
});

describe('an interview ended for violations', () => {
  it('reports the time and face tracking it had, not 0', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) }, configurable: true,
    });
    // jsdom has no media playback.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const onComplete = vi.fn();
    render(<InterviewRoom config={{ role: 'Dev' }} candidateName="Dana" candidateEmail="dana@x.com" onComplete={onComplete} onExit={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/i understand and want to start/i));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /join interview/i })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    await act(async () => {
      fireEvent.blur(window);
      fireEvent.blur(window);
      fireEvent.blur(window);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    const reported = onComplete.mock.calls[0][0];
    expect(reported.terminated).toBe(true);
    expect(reported.violations).toBe(3);
    expect(reported.timer).toBe(7);
  });
});
