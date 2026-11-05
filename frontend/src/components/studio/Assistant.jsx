import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Sparkles } from 'lucide-react';

import { useApp } from '../../context/AppContext';
import JarvisOverPage from './AskJarvis';

/* The assistant, in the sidebar of every manager page: one button, and the
 * choice of what to ask about. "Candidate chat" and "Ask Jarvis" were two ways
 * in, side by side and named differently. The chats behind it are still their
 * own:
 *   - the selected candidates: the dashboard's chat. The dashboard opens it
 *     itself (`onSelected`, and `selectedOpen` while it's open); other pages
 *     link to it;
 *   - the whole workspace: Jarvis, over the page. */
export default function Assistant({ onSelected, selectedOpen = false }) {
  const [open, setOpen] = useState(false);
  const [jarvis, setJarvis] = useState(false);
  const wrap = useRef(null);
  const button = useRef(null);
  const listId = useId();

  // A press anywhere else closes the choices.
  useEffect(() => {
    if (!open) return undefined;
    const outside = e => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = () => setOpen(false);
  // A choice closes the choices, and the focus goes back to the button, which
  // stays: Jarvis gives it back there when it closes.
  const choose = action => () => {
    button.current?.focus();
    close();
    action();
  };

  return (
    <div
      className="sw-assistant"
      ref={wrap}
      onKeyDown={e => {
        if (e.key !== 'Escape' || !open) return;
        close();
        button.current?.focus();
      }}
      // Leaving them by keyboard closes them too.
      onBlur={e => {
        if (e.relatedTarget && !wrap.current?.contains(e.relatedTarget)) close();
      }}
    >
      <button
        ref={button}
        type="button"
        className={`sw-assistant-button${selectedOpen ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen(was => !was)}
      >
        <Sparkles size={16} aria-hidden="true" /><span>Assistant</span><ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <Choices
          id={listId}
          onSelected={onSelected && choose(onSelected)}
          selectedOpen={selectedOpen}
          onLink={close}
          onJarvis={choose(() => setJarvis(true))}
        />
      )}
      {jarvis && <JarvisOverPage onClose={() => setJarvis(false)} />}
    </div>
  );
}

/* What it can answer about, the narrower first. Rendered only while open, so
 * the selection is counted as it opens. */
function Choices({ id, onSelected, selectedOpen, onLink, onJarvis }) {
  const { selectedCandidates } = useApp();
  const count = (selectedCandidates || []).filter(c => c.is_resume !== false).length;
  const selected = (
    <>
      <span>Selected candidates</span>
      <small>{count ? `Answers from the ${count === 1 ? 'one' : count} you selected` : 'Select them in Candidates first'}</small>
    </>
  );
  return (
    <div id={id} className="sw-assistant-choices" role="group" aria-labelledby={`${id}-about`}>
      <p id={`${id}-about`}>Ask about</p>
      {onSelected ? (
        <button type="button" aria-current={selectedOpen ? 'page' : undefined} onClick={onSelected}>{selected}</button>
      ) : (
        <Link to="/hiring?view=chat" onClick={onLink}>{selected}</Link>
      )}
      <button type="button" onClick={onJarvis}>
        <span>The whole workspace</span>
        <small>Jarvis, across every candidate. It can act, and asks first.</small>
      </button>
    </div>
  );
}
