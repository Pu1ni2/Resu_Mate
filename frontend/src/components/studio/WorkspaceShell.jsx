import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, SlidersHorizontal, Video, BarChart2, MessageSquare, ArrowUpRight, ScanSearch, Sparkles, Bell, Keyboard } from 'lucide-react';

import { useProduct } from '../ProductLayer';

/* The workspace's sections, in the sidebar's order. `view` is the dashboard's
 * name for each one, as in /hiring?view=…. */
const SECTIONS = [
  { id: 'candidates', view: 'upload', label: 'Candidates', icon: Users },
  { id: 'screening', view: 'screening', label: 'Screening', icon: SlidersHorizontal },
  { id: 'interviews', view: 'interviews', label: 'Interviews', icon: Video },
  { id: 'insights', view: 'analytics', label: 'Insights', icon: BarChart2 },
];

/* The frame the hiring workspace's pages share (styles/studio-workspace.css):
 * the sidebar with the sections, the top bar with Find Candidates, the
 * notifications and the keyboard shortcuts, the page's heading, and the footer.
 *
 * `active` is the section the page belongs to ('chat' for the candidate chat),
 * or none; `place` names the page in the top bar when it is in no section.
 * The dashboard switches its views itself, so it passes `onNavigate` (and
 * `onChat`, `onAssistant`); every other page links back to it. `footer` goes
 * at the sidebar's foot: the manager's account. */
export default function WorkspaceShell({
  active = null, place, eyebrow, title, subtitle, actions, footer,
  onNavigate, onChat, onAssistant, children,
}) {
  const product = useProduct();
  const registerFrame = product?.registerFrame;

  // While the frame is on screen, ProductLayer leaves the bell and the
  // shortcuts to its top bar instead of floating them over the page.
  useEffect(() => registerFrame?.(), [registerFrame]);

  const here = SECTIONS.find(s => s.id === active)?.label || (active === 'chat' ? 'Candidate chat' : place);
  const unread = product?.unreadCount || 0;

  return (
    <div className="studio-workspace">
      <a className="sw-skip" href="#workspace-content">Skip to content</a>

      <header className="sw-sidebar">
        <Link className="sw-brand" to="/" aria-label="ResuMate homepage">
          <span className="sw-brand-mark" aria-hidden="true" />ResuMate<span className="sw-brand-dot">.</span>
        </Link>

        <div className="sw-workspace-label">
          <span aria-hidden="true">R</span>
          <div>Your hiring desk<small>A little more human.</small></div>
        </div>

        <div className="sw-nav-label" aria-hidden="true">WORKSPACE</div>
        <nav className="sw-nav" aria-label="Hiring workspace">
          {SECTIONS.map(({ id, view, label, icon: Icon }, index) => {
            const content = (
              <>
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
                <small aria-hidden="true">0{index + 1}</small>
              </>
            );
            const props = {
              className: `sw-nav-item${active === id ? ' is-active' : ''}`,
              'aria-current': active === id ? 'page' : undefined,
            };
            return onNavigate
              ? <button key={id} type="button" {...props} onClick={() => onNavigate(view)}>{content}</button>
              : <Link key={id} {...props} to={`/hiring?view=${view}`}>{content}</Link>;
          })}
        </nav>

        <div className="sw-assist-links">
          {onChat ? (
            <button
              type="button"
              className={active === 'chat' ? 'is-active' : undefined}
              aria-current={active === 'chat' ? 'page' : undefined}
              onClick={onChat}
            >
              <MessageSquare size={16} aria-hidden="true" />Candidate chat
            </button>
          ) : (
            <Link to="/hiring?view=chat"><MessageSquare size={16} aria-hidden="true" />Candidate chat</Link>
          )}
          {onAssistant && (
            <button type="button" className="sw-assist-jarvis" onClick={onAssistant}>
              <Sparkles size={16} aria-hidden="true" /><span>Ask Jarvis</span><ArrowUpRight size={13} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="sw-sidebar-note">
          <span aria-hidden="true">✳</span>
          <p>See the person.<br /><em>Find the fit.</em></p>
          <small>Good decisions start<br />with a closer look.</small>
        </div>

        {footer && <div className="sw-sidebar-bottom">{footer}</div>}
      </header>

      <div className="sw-main">
        <div className="sw-topbar">
          <span><span className="sw-topbar-root">THE WORKSPACE <i aria-hidden="true">/</i> </span>{here}</span>
          <div className="sw-topbar-actions">
            <Link to="/hiring/sourcer">
              <ScanSearch size={16} aria-hidden="true" />Find Candidates<ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            {product && (
              <>
                <button
                  type="button"
                  className="sw-icon-button"
                  onClick={product.toggleNotifications}
                  title="Notifications (N)"
                  aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
                >
                  <Bell size={18} aria-hidden="true" />
                  {unread > 0 && <span className="sw-badge" aria-hidden="true">{unread}</span>}
                </button>
                <button
                  type="button"
                  className="sw-icon-button sw-shortcuts-button"
                  onClick={product.toggleShortcuts}
                  title="Keyboard shortcuts (?)"
                  aria-label="Keyboard shortcuts"
                >
                  <Keyboard size={18} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>

        <main id="workspace-content" className="sw-content" tabIndex={-1}>
          {title && (
            <header className="sw-page-header">
              <div>
                {eyebrow && <p className="sw-eyebrow">{eyebrow}</p>}
                <h1>{title}</h1>
                {subtitle && <p className="sw-subtitle">{subtitle}</p>}
              </div>
              {actions && <div className="sw-page-actions">{actions}</div>}
            </header>
          )}
          {children}
        </main>

        <footer className="sw-footer">
          <span>Built around people.</span>
          <div>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
