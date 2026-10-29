import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InterviewHub from './InterviewHub';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });
const response = body => ({ ok: true, status: 200, json: async () => body });
const open = () => render(<MemoryRouter><InterviewHub candidates={[{ id: 1, name: 'Ada', email: 'ada@example.com' }]} /></MemoryRouter>);

describe('the interview overview', () => {
  it('uses saved statuses, filters invitations, and opens a completed report', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url => response(String(url).endsWith('interview-statuses') ? { statuses: { 'ada@example.com': { id: 1, status: 'completed' }, 'grace@example.com': { id: 2, status: 'pending' } } } : { results: [{ email: 'ada@example.com', candidate_id: 1, report: { scores: [8], timer: 60, report: 'A considered answer.' } }] }));
    open();
    expect(await screen.findByRole('heading', { name: 'Ada' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Invitations' }));
    expect(screen.queryByRole('heading', { name: 'Ada' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'grace@example.com' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    fireEvent.click(screen.getByRole('button', { name: 'View report' }));
    expect(screen.getByRole('heading', { name: 'Interview Completed' })).toBeTruthy();
  });
  it('shows a failure and retry instead of reporting an empty interview history', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500, json: async () => ({ detail: 'Please try again.' }) });
    open();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Your next conversation starts here.')).toBeNull();
    fetcher.mockResolvedValue(response({ statuses: {}, results: [] }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('Your next conversation starts here.')).toBeTruthy());
  });
});
