import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CandidateFocus from './CandidateFocus';

/* A candidate's file opens on their newest kept evaluation: one was lost on
 * opening another file, or a refresh. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Data Scientist', skills: ['Python'], is_resume: true };
const GRACE = { id: 2, name: 'Grace', predicted_role: 'Backend Engineer', skills: ['Go'], is_resume: true };

// As GET /chat/candidates/2/evaluations sends it, in the server's naive UTC.
const KEPT = {
  evaluation_id: 4, role: 'Backend Engineer', level: 'Senior', experience_required: '5-8 years',
  job_description: null, anonymized: false, report: 'Grace has led two Go services.', created_at: '2026-11-02T15:04:00',
};
const when = new Date('2026-11-02T15:04:00Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

let kept;
const reply = body => ({ ok: true, status: 200, json: async () => body });

function openEvaluation(path = '/hiring/focus?candidate=2') {
  render(<MemoryRouter initialEntries={[path]}><CandidateFocus /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: /04 Evaluation/ }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.app = { candidates: [ADA, GRACE], anonymize: false, getDisplayName: c => c.name };
  kept = { 2: [KEPT] };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    const match = String(url).match(/\/candidates\/(\d+)\/evaluations$/);
    return reply(match ? { evaluations: kept[match[1]] || [] } : {});
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a candidate's kept evaluation", () => {
  it('shows when the file opens, saying when it was written and for what', async () => {
    openEvaluation();
    expect(await screen.findByText('Grace has led two Go services.')).toBeTruthy();
    expect(screen.getByText(`Evaluated ${when} for Backend Engineer, Senior.`)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export evaluation/ })).toBeTruthy();
  });

  it('gives way to a new one on Start Over', async () => {
    openEvaluation();
    await screen.findByText('Grace has led two Go services.');
    fireEvent.click(screen.getByRole('button', { name: '← Start Over' }));
    expect(screen.queryByText('Grace has led two Go services.')).toBeNull();
    expect(screen.getByText('Quick Setup')).toBeTruthy();
  });

  it('says it was against a job description when no role was given', async () => {
    kept = { 2: [{ ...KEPT, role: null, level: null, job_description: 'We want a backend engineer.' }] };
    openEvaluation();
    expect(await screen.findByText(`Evaluated ${when} against a job description.`)).toBeTruthy();
  });

  it('is each file\'s own', async () => {
    openEvaluation('/hiring/focus?candidate=1');
    await screen.findByText('Quick Setup');
    expect(screen.queryByText('Grace has led two Go services.')).toBeNull();
  });
});

describe('while names are hidden', () => {
  it('keeps one written with the name hidden, and says why', async () => {
    mocks.app.anonymize = true;
    openEvaluation();
    expect(await screen.findByText(/written with the candidate's name, so it stays hidden while names are/)).toBeTruthy();
    expect(screen.queryByText('Grace has led two Go services.')).toBeNull();
    expect(screen.getByText('Quick Setup')).toBeTruthy();
  });

  it('shows one written with names hidden', async () => {
    mocks.app.anonymize = true;
    kept = { 2: [{ ...KEPT, anonymized: true, report: 'Candidate 2 has led two Go services.' }] };
    openEvaluation();
    expect(await screen.findByText('Candidate 2 has led two Go services.')).toBeTruthy();
  });
});
