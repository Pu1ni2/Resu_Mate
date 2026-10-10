import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import App from '../App';
import ChatPanel from './focus/ChatPanel';
import ProductLayer from './ProductLayer';

/* Places that led nowhere: an unknown address sent people home without a word,
 * there was no favicon, Esc was said to clear the chat and didn't, and the
 * shortcuts panel said Ctrl+Enter sends when Enter does. */

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('an address the app does not have', () => {
  it('says so, with the ways in', async () => {
    render(<MemoryRouter initialEntries={['/no/such/page']}><AppProvider><App /></AppProvider></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Hiring manager sign-in' }).getAttribute('href')).toBe('/hiring/login');
    expect(screen.getByRole('link', { name: 'Candidate portal' }).getAttribute('href')).toBe('/candidate/login');
  });
});

describe('the favicon', () => {
  it('is there, and the page names it', () => {
    const root = path.resolve(__dirname, '../..');
    expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg">');
    expect(fs.existsSync(path.join(root, 'public', 'favicon.svg'))).toBe(true);
  });
});

describe('the chat input', () => {
  it('clears on Esc', () => {
    const setChatInput = vi.fn();
    render(
      <ChatPanel messages={[]} isTyping={false} suggestions={[]} chatInput="half a question" setChatInput={setChatInput}
        onSend={vi.fn()} scanDone candidateName="Ada" anonymize={false} msgEndRef={{ current: null }}
        voice={{ isRecording: false, isTranscribing: false, startRecording: vi.fn(), stopRecording: vi.fn(), speakText: vi.fn(),
          speakingMsgIndex: null, loadingMsgIndex: null }} />,
    );
    fireEvent.keyDown(screen.getByDisplayValue('half a question'), { key: 'Escape' });
    expect(setChatInput).toHaveBeenCalledWith('');
  });
});

describe('the shortcuts panel', () => {
  it('says Enter sends, as it does', () => {
    render(<MemoryRouter initialEntries={['/hiring']}><ProductLayer><div /></ProductLayer></MemoryRouter>);
    act(() => { fireEvent.keyDown(window, { key: '?', shiftKey: true }); });
    const send = screen.getByText('Send message').parentElement;
    expect(send.textContent).toBe('Send message↵');
  });
});
