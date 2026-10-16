import React from 'react';
import { Link } from 'react-router-dom';

import PageFrame from './auth/PageFrame';
import useHeadingFocus from '../hooks/useHeadingFocus';

/* An address the app doesn't have. It used to send everyone to the home page
 * without a word, so a mistyped or old link looked like a broken app. In the
 * sign-in pages' design (styles/studio-auth.css). */

const WAYS_ON = [
  ['/', 'ResuMate home'],
  ['/hiring/login', 'Hiring manager sign-in'],
  ['/candidate/login', 'Candidate portal'],
];

export default function NotFound() {
  const heading = useHeadingFocus();
  return (
    <PageFrame title="Page not found — ResuMate" skipTo="page-content" skipLabel="Skip to content">
      <main className="solo-layout" id="page-content" tabIndex={-1}>
        <div className="solo-card">
          <p className="form-eyebrow">Error 404</p>
          <h1 className="form-title" ref={heading} tabIndex={-1}>Page not found.</h1>
          <p className="form-intro">There’s nothing at this address.</p>
          <ul className="way-list">
            {WAYS_ON.map(([to, label]) => (
              <li key={to}><Link to={to}>{label}<span aria-hidden="true">→</span></Link></li>
            ))}
          </ul>
        </div>
      </main>
    </PageFrame>
  );
}
