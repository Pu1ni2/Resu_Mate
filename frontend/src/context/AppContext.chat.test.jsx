import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

import { AppProvider, useApp } from './AppContext';
import { chatAPI } from '../services/api';

/* The selected-candidates chat when it opens. The server keeps its
 * conversation; the page started afresh on every visit, so the chat answered
 * from things the page no longer showed. */

let app;
function Probe() {
  app = useApp();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  render(<AppProvider><Probe /></AppProvider>);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('the chat, when it opens', () => {
  it('shows the conversation the server kept', async () => {
    vi.spyOn(chatAPI, 'history').mockResolvedValue({ data: { messages: [
      { role: 'user', content: 'Who knows Python best?' },
      { role: 'assistant', content: 'Ada, with five years of it.' },
    ] } });
    const greeting = vi.spyOn(chatAPI, 'getIntro');
    await act(async () => { await app.initChat(); });
    expect(app.messages.map(m => [m.role, m.content])).toEqual([
      ['user', 'Who knows Python best?'], ['assistant', 'Ada, with five years of it.'],
    ]);
    expect(greeting).not.toHaveBeenCalled();
  });

  it('greets, with suggestions, when there is none', async () => {
    vi.spyOn(chatAPI, 'history').mockResolvedValue({ data: { messages: [] } });
    vi.spyOn(chatAPI, 'getIntro').mockResolvedValue({ data: { response: 'Ask about them.', suggestions: ['Compare'] } });
    await act(async () => { await app.initChat(); });
    expect(app.messages).toEqual([{ role: 'assistant', content: 'Ask about them.' }]);
    expect(app.suggestions).toEqual(['Compare']);
  });

  it('greets when the conversation cannot be read', async () => {
    vi.spyOn(chatAPI, 'history').mockRejectedValue(new Error('Network Error'));
    vi.spyOn(chatAPI, 'getIntro').mockResolvedValue({ data: { response: 'Ask about them.', suggestions: [] } });
    await act(async () => { await app.initChat(); });
    expect(app.messages).toEqual([{ role: 'assistant', content: 'Ask about them.' }]);
  });
});
