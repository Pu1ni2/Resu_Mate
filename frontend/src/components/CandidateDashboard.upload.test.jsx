import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import App from '../App';
import { TOAST_EVENT } from '../services/notify';

/* A résumé upload said nothing while it worked, and took a second file
 * meanwhile. It says what it's doing now, takes one file at a time, and the
 * résumé shown stays until the new one is ready. */

const SESSION = {
  email: 'dana@x.com', name: 'Dana', has_interview: false, interview_completed: false, interview_config: null,
};
const OLD = { found: true, name: 'Dana Old', role: 'Analyst', skills: ['SQL'] };
const NEW = { success: true, data: { name: 'Dana New', predicted_role: 'Data Engineer', skills: ['Python'] } };

let server;
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

// A reply that comes when the test says.
function later() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function openPortal() {
  localStorage.setItem('resumate_candidate', JSON.stringify(SESSION));
  localStorage.setItem('resumate_candidate_token', 'cand-jwt');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    const path = Object.keys(server).find(p => String(url).endsWith(p));
    return path ? server[path]() : reply({});
  });
  return render(
    <MemoryRouter initialEntries={['/candidate/dashboard']}>
      <AppProvider><App /></AppProvider>
    </MemoryRouter>,
  );
}

const pdf = name => new File(['%PDF-1.4'], name, { type: 'application/pdf' });
const choose = (container, id, file) => fireEvent.change(container.querySelector(`#${id}`), { target: { files: [file] } });
const uploads = () => fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/advisor/upload-resume'));

let toasts;
const onToast = e => toasts.push(e.detail);

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  toasts = [];
  window.addEventListener(TOAST_EVENT, onToast);
  server = {
    '/api/chat/candidate/me': () => reply(SESSION),
    '/api/advisor/context': () => reply({ found: false }),
  };
});

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, onToast);
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('uploading a résumé', () => {
  it('says what it is doing, and takes no second file meanwhile', async () => {
    const answer = later();
    server['/api/advisor/upload-resume'] = () => answer.promise;
    const { container } = openPortal();
    await screen.findByRole('heading', { name: 'Upload Your Resume' }, { timeout: 5000 });
    choose(container, 'cd-file', pdf('cv.pdf'));
    expect(await screen.findByText('Reading it for your advisor. This takes a moment.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Uploading your résumé…' })).toBeTruthy();
    choose(container, 'cd-file', pdf('another.pdf'));
    expect(uploads()).toHaveLength(1);
    answer.resolve(reply(NEW));
    expect(await screen.findByRole('heading', { name: 'Dana New' })).toBeTruthy();
  });

  it('keeps the résumé shown until the new one is ready', async () => {
    server['/api/advisor/context'] = () => reply(OLD);
    const answer = later();
    server['/api/advisor/upload-resume'] = () => answer.promise;
    const { container } = openPortal();
    await screen.findByRole('heading', { name: 'Dana Old' }, { timeout: 5000 });
    choose(container, 'cd-file-replace', pdf('cv.pdf'));
    const button = await screen.findByRole('button', { name: /Reading your new résumé/ });
    expect(button.disabled).toBe(true);
    expect(screen.getByRole('heading', { name: 'Dana Old' })).toBeTruthy();
    answer.resolve(reply(NEW));
    expect(await screen.findByRole('heading', { name: 'Dana New' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Replace Resume/ }).disabled).toBe(false);
  });

  it("says the server's reason when the file is refused, and can be tried again", async () => {
    server['/api/advisor/upload-resume'] = () => reply({ detail: 'Only PDF, DOCX or TXT files can be read.' }, 400);
    const { container } = openPortal();
    await screen.findByRole('heading', { name: 'Upload Your Resume' }, { timeout: 5000 });
    choose(container, 'cd-file', pdf('cv.pdf'));
    await waitFor(() => expect(toasts).toEqual([{ message: 'Only PDF, DOCX or TXT files can be read.', type: 'error' }]));
    expect(await screen.findByRole('heading', { name: 'Upload Your Resume' })).toBeTruthy();
    choose(container, 'cd-file', pdf('cv.pdf'));
    await waitFor(() => expect(uploads()).toHaveLength(2));
  });

  it('says so in plain words when the server can\'t be reached', async () => {
    server['/api/advisor/upload-resume'] = () => { throw new TypeError('Failed to fetch'); };
    const { container } = openPortal();
    await screen.findByRole('heading', { name: 'Upload Your Resume' }, { timeout: 5000 });
    choose(container, 'cd-file', pdf('cv.pdf'));
    await waitFor(() => expect(toasts).toEqual([{ message: "Your résumé couldn't be uploaded. Please try again.", type: 'error' }]));
  });
});
