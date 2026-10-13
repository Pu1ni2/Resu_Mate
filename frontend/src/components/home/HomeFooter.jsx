import React from 'react';
import { Link } from 'react-router-dom';

/* The footer: the legal pages, and a switch for the page's motion. The switch's
 * words say whether motion is on, so it does not also claim to be pressed. When
 * the computer asks for reduced motion, that setting wins and the switch says
 * so. */
export default function HomeFooter({ reduced, paused, onToggleMotion }) {
  const motion = reduced ? 'Motion: off (your setting)' : `Motion: ${paused ? 'off' : 'on'}`;
  return (
    <footer className="wrap footer">
      <a href="#top" className="logo"><span className="logo-symbol" aria-hidden="true" />ResuMate</a>
      <nav className="footer-links" aria-label="Legal">
        <Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/privacy/delete">Delete my data</Link>
      </nav>
      <div className="footer-end">
        <span>© {new Date().getFullYear()} ResuMate</span>
        <button className="motion-toggle" type="button" disabled={reduced} onClick={onToggleMotion}>{motion}</button>
      </div>
    </footer>
  );
}
