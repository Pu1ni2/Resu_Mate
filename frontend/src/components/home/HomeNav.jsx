import React from 'react';
import { Link } from 'react-router-dom';

/* The menu. Platform and For candidates open the preview on the right tab;
 * How it works opens its page. */
export default function HomeNav({ signInTo, onShow }) {
  const show = tab => (event) => {
    event.preventDefault();
    onShow(tab);
  };

  return (
    <div className="wrap">
      <header className="nav">
        <a href="#top" className="logo" aria-label="ResuMate home"><span className="logo-symbol" aria-hidden="true" />ResuMate</a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#platform" onClick={show('screen')}>Platform</a>
          <Link to="/how-it-works">How it works</Link>
          <a href="#platform" onClick={show('candidate')}>For candidates</a>
        </nav>
        <div className="nav-actions">
          <Link className="nav-login" to="/candidate/login">Candidate login</Link>
          <Link className="nav-cta" to={signInTo}>Sign in <span className="arrow" aria-hidden="true">↗</span></Link>
        </div>
      </header>
    </div>
  );
}
