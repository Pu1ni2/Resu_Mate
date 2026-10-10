import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import WebSearchPanel from './WebSearchPanel';
import JarvisAgent from '../pipeline/JarvisAgent';

/* A web search that isn't set up, or failed, looked like "nothing about this
 * person online": an empty list, or a fake result card counted as "Found 1
 * result". It now says why there was no search. */

vi.mock('../../hooks/useVoice', () => ({
  default: () => ({
    isRecording: false, isTranscribing: false, speakingMsgIndex: null,
    speakText: async () => {}, startRecording: () => {}, stopRecording: () => {}, stopSpeaking: () => {},
  }),
}));

const NOT_SET_UP = "Web search isn't set up on this server.";

function panel(props = {}) {
  return render(
    <WebSearchPanel
      searchQuery="Ada" setSearchQuery={vi.fn()} searchResults={[]} searchLoading={false}
      searchHistory={[]} onSearch={vi.fn()} getSearchSuggestions={() => []} {...props}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the search panel', () => {
  it('says why there was no search', () => {
    panel({ searchError: NOT_SET_UP });
    expect(screen.getByRole('alert').textContent).toBe(NOT_SET_UP);
    expect(screen.queryByText(/found \d+ result/i)).toBeNull();
  });

  it('shows no error when there is none', () => {
    panel();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe("Jarvis's web search", () => {
  it('says the search is not set up rather than "no useful results"', async () => {
    const replies = [{ reply: 'Looking.', action: 'research_web', action_params: { query: 'Ada Lovelace' } }];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const path = String(url).replace(/^.*?\/api\//, '/api/');
      const ok = body => ({ ok: true, status: 200, json: async () => body });
      if (path === '/api/jarvis/chat') return ok(replies.shift() || { reply: 'Okay.', action: null });
      if (path === '/api/chat/web-search') return ok({ results: [], error: NOT_SET_UP });
      return ok({});
    });
    render(<JarvisAgent candidatesSummary={[]} onClose={vi.fn()} onComplete={vi.fn()} />);
    const input = screen.getByLabelText('Message Jarvis');
    fireEvent.change(input, { target: { value: 'search the web for Ada' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText(`I couldn't search the web: ${NOT_SET_UP}`)).toBeTruthy();
    expect(screen.queryByText(/no useful results/i)).toBeNull();
  });
});
