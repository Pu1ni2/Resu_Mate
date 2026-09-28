import { describe, it, expect, beforeEach, vi } from 'vitest';

import { splitLines, streamRun } from './sourcerStream';
import { TOKEN_KEY } from './session';

/* A sourcing run arrives as NDJSON over a live connection, and the network is
 * free to cut it anywhere: mid-line, mid-character. Every event must still
 * arrive once, whole, in order. */

const encoder = new TextEncoder();

function bodyOf(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      controller.close();
    },
  });
}

function respond(chunks, init = {}) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, body: bodyOf(chunks), ...init });
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('splitLines', () => {
  it('keeps the unfinished line for later', () => {
    expect(splitLines('{"a":1}\n{"b":')).toEqual([['{"a":1}'], '{"b":']);
  });

  it('drops blank lines', () => {
    expect(splitLines('\n{"a":1}\n\n')).toEqual([['{"a":1}'], '']);
  });
});

describe('streamRun', () => {
  it('delivers every event once, in order, however the chunks fall', async () => {
    respond(['{"type":"plan"}\n{"type":"fou', 'nd","n":1}\n', '{"type":"done"}']);
    const events = [];
    const result = await streamRun({ description: 'x' }, e => events.push(e));
    expect(events.map(e => e.type)).toEqual(['plan', 'found', 'done']);
    expect(result).toEqual({ stopped: false });
  });

  it('decodes a character split across two chunks', async () => {
    const bytes = encoder.encode('{"name":"José"}\n');
    const cut = bytes.indexOf(0xc3) + 1; // between the two bytes of "é"
    respond([bytes.slice(0, cut), bytes.slice(cut)]);
    const events = [];
    await streamRun({}, e => events.push(e));
    expect(events).toEqual([{ name: 'José' }]);
  });

  it('skips a line that is not JSON instead of failing the run', async () => {
    respond(['{"type":"plan"}\nnot json\n{"type":"done"}\n']);
    const events = [];
    await streamRun({}, e => events.push(e));
    expect(events.map(e => e.type)).toEqual(['plan', 'done']);
  });

  it('posts the body with the manager token', async () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-abc');
    const spy = respond(['{"type":"done"}\n']);
    await streamRun({ description: 'Backend engineer' }, () => {});
    const [url, options] = spy.mock.calls[0];
    expect(url).toMatch(/\/api\/sourcer\/runs$/);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer jwt-abc');
    expect(JSON.parse(options.body)).toEqual({ description: 'Backend engineer' });
  });

  it('shows the server reason when a run cannot start', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false, status: 400, json: async () => ({ detail: "Describe who you're looking for." }),
    });
    await expect(streamRun({}, () => {})).rejects.toThrow("Describe who you're looking for.");
  });

  it('says so when the hourly limit is reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(streamRun({}, () => {})).rejects.toThrow(/Too many searches/);
  });

  it('treats an abort as a stop, not an error', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abort);
    await expect(streamRun({}, () => {}, new AbortController().signal)).resolves.toEqual({ stopped: true });
  });

  it('stops reading when aborted part way', async () => {
    const controller = new AbortController();
    let reads = 0;
    // First read delivers an event; the second fails the way an aborted fetch
    // body does. (Erroring in the same pull would discard the queued chunk.)
    const body = new ReadableStream({
      pull(c) {
        reads += 1;
        if (reads === 1) {
          c.enqueue(encoder.encode('{"type":"found"}\n'));
          return;
        }
        controller.abort();
        c.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, body });
    const events = [];
    await expect(streamRun({}, e => events.push(e), controller.signal)).resolves.toEqual({ stopped: true });
    expect(events).toEqual([{ type: 'found' }]);
  });

  it('reports an unreachable server plainly', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(streamRun({}, () => {})).rejects.toThrow(/Could not reach the server/);
  });
});
