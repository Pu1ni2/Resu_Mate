import React from 'react';
import { Link } from 'react-router-dom';
import { Users, SlidersHorizontal, Video, BarChart2, MessageSquare, ArrowUpRight, ScanSearch, Sparkles } from 'lucide-react';
import '../../styles/studio-workspace.css';

const sections = [
  { id: 'candidates', view: 'upload', label: 'Candidates', icon: Users },
  { id: 'screening', view: 'screening', label: 'Screening', icon: SlidersHorizontal },
  { id: 'interviews', view: 'interviews', label: 'Interviews', icon: Video },
  { id: 'insights', view: 'analytics', label: 'Insights', icon: BarChart2 },
];

export default function WorkspaceShell({ active = 'candidates', title, eyebrow, subtitle, actions, children, footer, onNavigate, onChat, onAssistant }) {
  return (
    <div className="studio-workspace">
      <a className="sw-skip" href="#workspace-content">Skip to content</a>
      <aside className="sw-sidebar">
        <Link className="sw-brand" to="/" aria-label="ResuMate home"><span className="sw-brand-mark" aria-hidden="true">r</span>ResuMate<span className="sw-brand-dot">.</span></Link>
        <div className="sw-workspace-label"><span aria-hidden="true">R</span><div>Your hiring desk<small>A little more human.</small></div></div>
        <div className="sw-nav-label">WORKSPACE</div>
        <nav className="sw-nav" aria-label="Hiring workspace">
          {sections.map(({ id, view, label, icon: Icon }, index) => {
            const content = <><Icon size={18} /><span>{label}</span><small aria-hidden="true">0{index + 1}</small></>;
            const props = { className: `sw-nav-item ${active === id ? 'is-active' : ''}`, 'aria-current': active === id ? 'page' : undefined };
            return onNavigate ? <button key={id} {...props} onClick={() => onNavigate(view)}>{content}</button> : <Link key={id} {...props} to={`/hiring?view=${view}`}>{content}</Link>;
          })}
        </nav>
        <div className="sw-assist-links">
          {onChat ? <button onClick={onChat} className={active === 'chat' ? 'is-active' : ''}><MessageSquare size={16} />Candidate chat</button> : <Link to="/hiring?view=chat"><MessageSquare size={16} />Candidate chat</Link>}
          {onAssistant && <button onClick={onAssistant}><Sparkles size={16} />Ask Jarvis<ArrowUpRight size={13} /></button>}
        </div>
        <div className="sw-sidebar-note"><span aria-hidden="true">✳</span><p>See the person.<br /><em>Find the fit.</em></p><small>Good decisions start<br />with a closer look.</small></div>
        <div className="sw-sidebar-bottom"><Link to="/how-it-works">How it works <ArrowUpRight size={14} /></Link>{footer}</div>
      </aside>
      <div className="sw-main">
        <div className="sw-topbar"><span>THE WORKSPACE <i>/</i> {sections.find(s => s.id === active)?.label || 'Candidate chat'}</span><Link to="/hiring/sourcer"><ScanSearch size={16} />Find Candidates<ArrowUpRight size={14} /></Link></div>
        {title && <header className="sw-page-header"><div>{eyebrow && <p className="sw-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{subtitle && <p className="sw-subtitle">{subtitle}</p>}</div>{actions && <div className="sw-page-actions">{actions}</div>}</header>}
        <main id="workspace-content" className="sw-content" tabIndex={-1}>{children}</main>
        <footer className="sw-footer"><span>Built around people.</span><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div></footer>
      </div>
    </div>
  );
}
