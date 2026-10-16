import React from 'react';
import { Link } from 'react-router-dom';

import useStudioPage from '../../hooks/useStudioPage';

/* The frame the pages in the sign-in design share (styles/studio-auth.css):
 * the logo and the way back home above, the legal links below, and the tab
 * title. The skip link jumps to `skipTo`, the id of the page's own part.
 * `defs` holds SVG definitions the page's pictures use. */
export default function PageFrame({ title, skipTo, skipLabel, defs = null, children }) {
  useStudioPage(title);

  return (
    <div className="studio-auth">
      <a className="skip-link" href={`#${skipTo}`}>{skipLabel}</a>
      {defs}
      <div className="site-wrap">
        <header className="site-header">
          <Link to="/" className="brand" aria-label="ResuMate homepage">
            <span className="brand-mark" aria-hidden="true" />ResuMate<span className="brand-dot">.</span>
          </Link>
          <Link className="back-home" to="/"><span aria-hidden="true">↖</span> Back to the homepage</Link>
        </header>

        {children}

        <footer className="site-footer">
          <span>Thoughtful hiring. Human possibilities.</span>
          <div>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <span>© {new Date().getFullYear()} ResuMate</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
