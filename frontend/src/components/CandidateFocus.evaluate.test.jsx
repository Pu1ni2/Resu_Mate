import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

import CandidateFocus from './CandidateFocus';

/* An evaluation is written in the background: asking for one answers with
 * the request, and the file follows it until it's written. It was written
 * inside the request, and lost when the manager left the file. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Data Scientist', skills: ['Python'], is_resume: true };
const ASKED = { request_id: 5, candidate_id: 1, status: 'pending', error: null, role: 'Data Scientist', level: 'Senior',
  anonymized: false, evaluation: null };
const WRITTEN = { ...ASKED, status: 'done', evaluation: {
  evaluation_id: 9, role: 'Data Scientist', level: 'Senior', anonymized: false, report: 'A strong fit for the role.',
  created_at: '2026-11-20T10:00:00' } };

let calls;
let server;  // each address's answers, the last again once they run out

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.app = { candidates: [ADA], anonymize: false, getDisplayName: c => c.name };
  calls = [];
  server = {
    '/api/chat/candidates/1/evaluations': [{ evaluations: [], asked: null }],
    '/api/chat/hiring-agent': [ASKED],
    '/api/chat/evaluations/5': [ASKED, WRITTEN],
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const path = String(url).replace(/^.*?\/api\//, '/api/');
    calls.push(path);
    const answers = server[path];
    const body = answers ? (answers.length > 1 ? answers.shift() : answers[0]) : {};
    return { ok: true, status: 200, json: async () => body };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const asks = () => calls.filter(path => path === '/api/chat/evaluations/5').length;

async function openAda() {
  render(<MemoryRouter><CandidateFocus /></MemoryRouter>);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open file for Ada' })); });
  fireEvent.click(screen.getByRole('button', { name: /evaluate role fit/i }));
}

function evaluate() {
  fireEvent.click(screen.getByRole('button', { name: /quick setup/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Data Scientist' }));
  fireEvent.click(screen.getByRole('button', { name: '3-5 years' }));
  fireEvent.click(screen.getByRole('button', { name: 'Senior' }));
  return act(async () => { fireEvent.click(screen.getByRole('button', { name: /evaluate candidate/i })); });
}

describe('an evaluation written in the background', () => {
  it('is followed from the file until it has been written', async () => {
    await openAda();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await evaluate();
    expect(screen.getByText(/writing the evaluation/i)).toBeTruthy();
    // It's written in the background, whatever the manager does meanwhile.
    expect(screen.getByText(/goes on if you leave this file/i)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByText(/writing the evaluation/i)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByText('A strong fit for the role.')).toBeTruthy();
    // Written: asked after no more.
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(asks()).toBe(2);
  });

  it("says why, in the server's words, when it couldn't be written", async () => {
    server['/api/chat/evaluations/5'] = [{ ...ASKED, status: 'failed', error: 'The AI was busy each time it was asked.' }];
    await openAda();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await evaluate();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByText('The AI was busy each time it was asked.')).toBeTruthy();
  });

  it('is followed again when the file is opened, still being written', async () => {
    server['/api/chat/candidates/1/evaluations'] = [{ evaluations: [], asked: ASKED }];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await openAda();
    expect(screen.getByText(/writing the evaluation/i)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(screen.getByText('A strong fit for the role.')).toBeTruthy();
  });

  it('is asked after no more once the manager leaves the file', async () => {
    await openAda();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await evaluate();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(asks()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'All candidate files' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(asks()).toBe(1);
  });

  it('is asked after no more once the page closes, or another file opens', async () => {
    const BEA = { id: 2, name: 'Bea', predicted_role: 'Analyst', skills: [], is_resume: true };
    mocks.app = { ...mocks.app, candidates: [ADA, BEA] };
    function OpenBea() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate('/?candidate=2')}>Open Bea from elsewhere</button>;
    }
    const shown = render(<MemoryRouter><CandidateFocus /><OpenBea /></MemoryRouter>);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open file for Ada' })); });
    fireEvent.click(screen.getByRole('button', { name: /evaluate role fit/i }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await evaluate();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(asks()).toBe(1);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open Bea from elsewhere' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(asks()).toBe(1);
    // And closed while it's written, still being written all the while.
    server['/api/chat/candidates/2/evaluations'] = [{ evaluations: [], asked: { ...ASKED, candidate_id: 2 } }];
    server['/api/chat/evaluations/5'] = [ASKED];
    shown.unmount();
    calls = [];
    render(<MemoryRouter><CandidateFocus /></MemoryRouter>);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open file for Bea' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(asks()).toBe(1);
    cleanup();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(asks()).toBe(1);
  });
});
