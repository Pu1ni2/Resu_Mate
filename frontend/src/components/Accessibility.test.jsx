import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import { resetFeatures } from '../services/features';
import { toast } from '../services/notify';
import CandidateLogin from './CandidateLogin';
import ProductLayer from './ProductLayer';
import ChatPanel from './focus/ChatPanel';
import EmailComposer from './focus/EmailComposer';
import GitHubPanel from './focus/GitHubPanel';
import HiringAgentPanel from './focus/HiringAgentPanel';
import InterviewCreator from './focus/InterviewCreator';
import ScannerBar from './focus/ScannerBar';
import WebSearchPanel from './focus/WebSearchPanel';
import BatchActionConfirm from './pipeline/BatchActionConfirm';
import PipelineWizard from './pipeline/PipelineWizard';

/* Fields whose only label was a placeholder, or a <label> not tied to them;
 * buttons that were only an icon; and divs with onClick. A screen reader said
 * "edit text" and "button" with nothing after, and a keyboard couldn't reach
 * the divs at all. */

const ADA = { id: 1, name: 'Ada Lovelace', predicted_role: 'Engineer' };
const PEOPLE = [{ candidate_id: 1, name: 'Ada', ats_score: 80, verdict: 'Strong Fit', email: 'ada@x.com' }];

const agentProps = (props = {}) => ({
  agentStep: 'choose', setAgentStep: vi.fn(), jdText: '', setJdText: vi.fn(),
  selectedRole: '', setSelectedRole: vi.fn(), customRole: '', setCustomRole: vi.fn(),
  selectedExperience: '', setSelectedExperience: vi.fn(), selectedLevel: '', setSelectedLevel: vi.fn(),
  agentResult: null, agentLoading: false, suggestedRoles: [],
  onRunHiringAgent: vi.fn(), onRunJDAnalysis: vi.fn(), onReset: vi.fn(),
  onSwitchToChat: vi.fn(), agentResultRef: { current: null },
  ...props,
});

const renderLayer = () => render(
  <MemoryRouter initialEntries={['/hiring']}><ProductLayer><div /></ProductLayer></MemoryRouter>,
);

beforeEach(() => {
  localStorage.clear();
  resetFeatures();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true, status: 200, json: async () => ({ avatar_interviews: false }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fields say what they are for', () => {
  it('the email composer', async () => {
    render(<EmailComposer focusCandidate={ADA} agentResult={null} anonymize={false} getCandidatePayload={() => ({})} />);
    // The form shows once a kind of email is chosen and its draft is back.
    fireEvent.click(screen.getByRole('button', { name: 'Interview Invite' }));
    expect(await screen.findByLabelText('To')).toBeTruthy();
    for (const name of ['Subject', 'Body']) expect(screen.getByLabelText(name)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ Cc / Bcc' }));
    expect(screen.getByLabelText('Cc')).toBeTruthy();
    expect(screen.getByLabelText('Bcc')).toBeTruthy();
  });

  it('the interview form', () => {
    render(<InterviewCreator focusCandidate={ADA} selectedRole="" selectedLevel="" selectedExperience="" scanContact={null} />);
    for (const name of ['Candidate Email *', 'Role', 'Number of Questions', 'Focus Areas']) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
  });

  it('the screening form', () => {
    localStorage.setItem('resumate_hm_token', 'test-token');
    render(<PipelineWizard candidateCount={12} onComplete={vi.fn()} />);
    for (const name of [/role you're hiring for/i, /job description/i, /must-have skills/i, /minimum experience/i]) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
  });

  it('the batch dialog', () => {
    render(<BatchActionConfirm selectedCandidates={PEOPLE} role="Dev" onClose={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByLabelText('Level')).toBeTruthy();
    expect(screen.getByLabelText('Questions')).toBeTruthy();
  });

  it("the hiring agent's job description, and its own role", () => {
    const { unmount } = render(<HiringAgentPanel {...agentProps({ agentStep: 'jd' })} />);
    expect(screen.getByLabelText('Paste the full Job Description:')).toBeTruthy();
    unmount();
    render(<HiringAgentPanel {...agentProps({ agentStep: 'quick', selectedRole: 'other' })} />);
    expect(screen.getByRole('textbox', { name: 'Role title' })).toBeTruthy();
  });

  it("the candidate's sign-in", async () => {
    render(<MemoryRouter><AppProvider><CandidateLogin /></AppProvider></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'dana@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send access code/i }));
    expect(await screen.findByRole('textbox', { name: 'Access code' })).toBeTruthy();
  });

  it('the GitHub lookup', () => {
    render(
      <GitHubPanel ghUsername="" setGhUsername={vi.fn()} ghProfile={null} ghLoading={false} ghError=""
        ghNeedsInput onFetchGitHub={vi.fn()} />,
    );
    expect(screen.getByRole('textbox', { name: 'GitHub username' })).toBeTruthy();
  });
});

describe('icon buttons have names', () => {
  it("the candidate chat's box and Send", () => {
    render(
      <ChatPanel messages={[]} isTyping={false} suggestions={[]} chatInput="" setChatInput={vi.fn()}
        onSend={vi.fn()} scanDone candidateName="Ada" anonymize={false} msgEndRef={{ current: null }}
        voice={{ isRecording: false, isTranscribing: false, startRecording: vi.fn(), stopRecording: vi.fn(), speakText: vi.fn(),
          speakingMsgIndex: null, loadingMsgIndex: null }} />,
    );
    expect(screen.getByRole('textbox', { name: 'Ask about Ada' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  it("the web search's box and Clear", () => {
    const setSearchQuery = vi.fn();
    render(
      <WebSearchPanel searchQuery="Ada" setSearchQuery={setSearchQuery} searchResults={[]} searchLoading={false}
        searchHistory={[]} onSearch={vi.fn()} getSearchSuggestions={() => []} />,
    );
    expect(screen.getByRole('textbox', { name: 'Search the web' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(setSearchQuery).toHaveBeenCalledWith('');
  });

  it("the batch dialog's Close", () => {
    const onClose = vi.fn();
    render(<BatchActionConfirm selectedCandidates={PEOPLE} role="Dev" onClose={onClose} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it("a toast's Dismiss", () => {
    localStorage.setItem('resumate_onboarded', 'true');
    renderLayer();
    act(() => { toast('Saved'); });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it("the notifications panel's Close", () => {
    localStorage.setItem('resumate_onboarded', 'true');
    renderLayer();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByRole('button', { name: 'Close notifications' })).toBeTruthy();
  });

  it("the shortcuts panel's Close", () => {
    localStorage.setItem('resumate_onboarded', 'true');
    renderLayer();
    act(() => { fireEvent.keyDown(window, { key: '?', shiftKey: true }); });
    expect(screen.getByRole('button', { name: 'Close shortcuts' })).toBeTruthy();
  });
});

describe('choices the keyboard can reach and press', () => {
  it("the hiring agent's two ways in", () => {
    const setAgentStep = vi.fn();
    render(<HiringAgentPanel {...agentProps({ setAgentStep })} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /paste job description/i }), { key: 'Enter' });
    expect(setAgentStep).toHaveBeenLastCalledWith('jd');
    fireEvent.keyDown(screen.getByRole('button', { name: /quick setup/i }), { key: ' ' });
    expect(setAgentStep).toHaveBeenLastCalledWith('quick');
  });

  it('the scan summary, once the scan is done, says whether it is open', () => {
    render(
      <ScannerBar scanLogs={[{ msg: 'Read the résumé', status: 'success' }]} scanProfiles={{}} scanSummary=""
        scanContact={null} scanRunning={false} scanDone onRescan={vi.fn()} />,
    );
    const bar = screen.getByRole('button', { name: /scan complete/i });
    expect(bar.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(bar.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Read the résumé')).toBeTruthy();
  });

  it('but not while the scan runs, when there is nothing to open', () => {
    render(
      <ScannerBar scanLogs={[]} scanProfiles={null} scanSummary="" scanContact={null}
        scanRunning scanDone={false} onRescan={vi.fn()} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it("the onboarding's steps", () => {
    vi.useFakeTimers();
    renderLayer();
    act(() => { vi.advanceTimersByTime(1600); }); // it opens after a short pause
    const second = screen.getByRole('button', { name: /^Step 2 of \d+$/ });
    expect(screen.getByRole('button', { name: /^Step 1 of \d+$/ }).getAttribute('aria-current')).toBe('step');
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(second.getAttribute('aria-current')).toBe('step');
  });
});
