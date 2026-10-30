import React, { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import WorkspaceShell from './WorkspaceShell';
import ProductLayer from '../ProductLayer';
import { toast, notify } from '../../services/notify';

/* The frame the hiring workspace's pages share: the four sections with the
 * current one marked, the way to the candidate chat, Jarvis and Find
 * Candidates, a skip link to the page's own part, and, inside ProductLayer,
 * the bell and the shortcuts in its top bar instead of floating over the page. */

const SECTIONS = ['Candidates', 'Screening', 'Interviews', 'Insights'];

const renderShell = (props = {}) => render(
  <MemoryRouter initialEntries={['/hiring']}>
    <WorkspaceShell title="A place for possibility." {...props}><p>The page</p></WorkspaceShell>
  </MemoryRouter>,
);

const renderInLayer = (props = {}) => render(
  <MemoryRouter initialEntries={['/hiring']}>
    <ProductLayer>
      <WorkspaceShell title="A place for possibility." {...props}><p>The page</p></WorkspaceShell>
    </ProductLayer>
  </MemoryRouter>,
);

const nav = () => screen.getByRole('navigation', { name: 'Hiring workspace' });
const href = name => screen.getByRole('link', { name }).getAttribute('href');
const topBar = () => document.querySelector('.sw-topbar > span').textContent;
const toolbar = () => document.querySelector('.pl-toolbar');
const toastsBelow = () => document.querySelector('.pl-toast-container').classList.contains('bottom-4');

beforeEach(() => {
  localStorage.clear();
  // The first-visit walkthrough would open over the page.
  localStorage.setItem('resumate_onboarded', 'true');
});

describe('the workspace frame', () => {
  it('lists the four sections in order, each leading to its view of the dashboard', () => {
    renderShell();
    const links = within(nav()).getAllByRole('link');
    SECTIONS.forEach((name, i) => expect(within(nav()).getByRole('link', { name })).toBe(links[i]));
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/hiring?view=upload', '/hiring?view=screening', '/hiring?view=interviews', '/hiring?view=analytics',
    ]);
  });

  it('marks the current section, and names it in the top bar', () => {
    renderShell({ active: 'screening' });
    expect(within(nav()).getByRole('link', { name: 'Screening' }).getAttribute('aria-current')).toBe('page');
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(topBar()).toBe('THE WORKSPACE / Screening');
  });

  it('marks no section on a page that is in none, and names the page instead', () => {
    renderShell({ place: 'Find Candidates' });
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(0);
    expect(topBar()).toBe('THE WORKSPACE / Find Candidates');
  });

  it("switches the dashboard's views itself, when the dashboard asks", () => {
    const onNavigate = vi.fn();
    renderShell({ active: 'candidates', onNavigate });
    expect(within(nav()).queryAllByRole('link')).toEqual([]);
    expect(within(nav()).getByRole('button', { name: 'Candidates' }).getAttribute('aria-current')).toBe('page');
    SECTIONS.forEach(name => fireEvent.click(within(nav()).getByRole('button', { name })));
    expect(onNavigate.mock.calls.map(([view]) => view)).toEqual(['upload', 'screening', 'interviews', 'analytics']);
  });

  it('leads to the candidate chat, and offers Jarvis only where the page can open it', () => {
    renderShell();
    expect(href('Candidate chat')).toBe('/hiring?view=chat');
    expect(screen.queryByRole('button', { name: 'Ask Jarvis' })).toBeNull();
  });

  it('opens the chat and Jarvis in the dashboard, and marks the chat when it is open', () => {
    const onChat = vi.fn();
    const onAssistant = vi.fn();
    renderShell({ active: 'chat', onNavigate: vi.fn(), onChat, onAssistant });
    const chat = screen.getByRole('button', { name: 'Candidate chat' });
    expect(chat.getAttribute('aria-current')).toBe('page');
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(0);
    expect(topBar()).toBe('THE WORKSPACE / Candidate chat');
    fireEvent.click(chat);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Jarvis' }));
    expect(onChat).toHaveBeenCalledTimes(1);
    expect(onAssistant).toHaveBeenCalledTimes(1);
  });

  it('leads home, to Find Candidates and to the legal pages', () => {
    renderShell();
    expect(href('ResuMate homepage')).toBe('/');
    expect(href('Find Candidates')).toBe('/hiring/sourcer');
    expect(href('Privacy')).toBe('/privacy');
    expect(href('Terms')).toBe('/terms');
  });

  it("skips to the page's own part, which starts with the page's heading", () => {
    renderShell({
      eyebrow: '01 / THE CANDIDATE COLLECTION',
      subtitle: 'Every résumé is a starting point.',
      actions: <button>Hide names</button>,
    });
    expect(href('Skip to content')).toBe('#workspace-content');
    const main = screen.getByRole('main');
    expect(main.id).toBe('workspace-content');
    // So the skip link can move the focus there, not only scroll.
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe('A place for possibility.');
    expect(within(main).getByText('01 / THE CANDIDATE COLLECTION')).toBeTruthy();
    expect(within(main).getByText('Every résumé is a starting point.')).toBeTruthy();
    expect(within(main).getByRole('button', { name: 'Hide names' })).toBeTruthy();
    expect(within(main).getByText('The page')).toBeTruthy();
  });

  it("puts the page's footer, the manager's account, at the sidebar's foot", () => {
    renderShell({ footer: <div>Jamie Parker</div> });
    const account = screen.getByText('Jamie Parker');
    // In the sidebar with the sections (jsdom counts the page heading's
    // <header> as a banner too, which browsers don't inside <main>).
    expect(account.closest('header')).toBe(nav().closest('header'));
    expect(screen.getByRole('main').contains(account)).toBe(false);
  });

  it('shows no bell or shortcuts without ProductLayer to open them', () => {
    renderShell();
    expect(screen.queryByRole('button', { name: /Notifications/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).toBeNull();
  });
});

describe('the frame inside ProductLayer', () => {
  it('holds the bell and the shortcuts in its top bar, and the floating toolbar steps aside', () => {
    renderInLayer();
    expect(toolbar()).toBeNull();
    const [bell] = screen.getAllByRole('button', { name: 'Notifications' });
    expect(screen.getAllByRole('button', { name: 'Notifications' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Keyboard shortcuts' })).toHaveLength(1);
    expect(bell.closest('.sw-topbar')).toBeTruthy();
  });

  it("counts unread notifications in the bell's name, and opens them from the top", () => {
    renderInLayer();
    act(() => notify('Report ready', 'Maya Chen finished her interview.'));
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    expect(screen.getByText('Maya Chen finished her interview.')).toBeTruthy();
    expect(document.querySelector('.pl-notif-panel').classList.contains('pl-notif-panel--top')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });

  it('opens the keyboard shortcuts from its top bar', () => {
    renderInLayer();
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(screen.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeTruthy();
  });

  it('shows notices at the bottom, clear of its top bar', () => {
    renderInLayer();
    act(() => toast('Saved.', 'success'));
    expect(screen.getByText('Saved.')).toBeTruthy();
    expect(toastsBelow()).toBe(true);
  });

  it('gives the floating toolbar and the top-right notices back once it has gone', () => {
    function Leaving() {
      const [shown, setShown] = useState(true);
      return (
        <>
          {shown && <WorkspaceShell title="A place for possibility." />}
          <button onClick={() => setShown(false)}>Leave</button>
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={['/hiring']}>
        <ProductLayer><Leaving /></ProductLayer>
      </MemoryRouter>,
    );
    expect(toolbar()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(toolbar()).toBeTruthy();
    expect(toastsBelow()).toBe(false);
  });
});
