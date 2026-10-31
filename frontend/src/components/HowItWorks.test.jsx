import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppProvider } from '../context/AppContext';
import App from '../App';
import HowItWorks from './HowItWorks';

/* How it works: the five steps of hiring with ResuMate, to follow at the
 * reader's pace, with each tool tied to its step. What it says is what the
 * app does, by the names the app uses. */

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const open = () => render(<MemoryRouter><HowItWorks /></MemoryRouter>);
const step = name => fireEvent.click(within(screen.getByRole('group', { name: 'Choose a workflow step' })).getByRole('button', { name }));

describe('the hiring workflow', () => {
  it('lets the reader follow the process and return to its beginning', () => {
    open();
    step(/^02.*Understand fit/);
    expect(screen.getByRole('heading', { name: 'Give fit a little context.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^02.*Understand fit/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Next: Look closer/ }));
    expect(screen.getByRole('heading', { name: 'Curiosity makes better questions.' })).toBeTruthy();
    step(/^05.*Review the picture/);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the beginning' }));
    expect(screen.getByRole('heading', { name: 'The candidate file' })).toBeTruthy();
  });

  it('connects each tool to its workflow step and gives both roles an entry point', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Interviewing.*Shapes role-specific questions/ }));
    expect(screen.getByRole('heading', { name: 'Let experience find its voice.' })).toBeTruthy();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Start hiring/ }).getAttribute('href')).toBe('/hiring/register');
    expect(screen.getByRole('link', { name: /here as a candidate/ }).getAttribute('href')).toBe('/candidate/login');
  });

  it('is titled as the other pages are', () => {
    open();
    expect(document.title).toBe('How it works — ResuMate');
  });
});

describe('what the page says', () => {
  it('calls Find candidates by its name', () => {
    const { container } = open();
    expect(screen.getByRole('button', { name: /Find candidates.*GitHub/ })).toBeTruthy();
    expect(container.textContent).toMatch(/use Find candidates to search your uploads, GitHub, and public web profiles/);
    expect(container.textContent).not.toMatch(/talent search|talent discovery/i);
  });

  it("asks for what the interview form asks for, and sends an invitation only when asked to", () => {
    open();
    step(/^04.*Have a conversation/);
    expect(screen.getByText('Choose the role, the number of questions, and the areas to explore.')).toBeTruthy();
    expect(screen.getByText(/ResuMate emails the interview invitation when you ask it to\. Other emails stay drafts/)).toBeTruthy();
    expect(screen.queryByText(/invitations are sent by the server/i)).toBeNull();
  });
});

describe('its address', () => {
  it('is /how-it-works, open to anyone', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    render(<MemoryRouter initialEntries={['/how-it-works']}><AppProvider><App /></AppProvider></MemoryRouter>);
    expect(await screen.findByRole('heading', { level: 1, name: /^From a résumé\./ })).toBeTruthy();
  });
});
