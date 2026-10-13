import React from 'react';
import { Link } from 'react-router-dom';

import { PEOPLE } from './samples';
import CandidateFile from './CandidateFile';

/* The top of the page: what ResuMate is, the two ways in, and the candidate
 * file with its three sample people. */
export default function Hero({ person, onChoose, startHiringTo }) {
  return (
    <>
      <section className="wrap cover" aria-labelledby="hero-title">
        <div className="intro">
          <div className="eyebrow issue">Read every résumé. Interview the best three.</div>
          {/* The space before "person." joins the words where the first break is hidden (phones). */}
          <h1 className="serif" id="hero-title">See the<br /> person.<br /><em>Find the fit.</em></h1>
          <p>Great people are more than a page. Connect résumé screening, AI interviews, and deeper insights in one hiring workspace.</p>
          <div className="actions">
            <Link className="primary" to={startHiringTo}>Start hiring <span className="arrow" aria-hidden="true">↗</span></Link>
            <Link className="secondary" to="/candidate/login">I'm a candidate</Link>
          </div>
          <div className="hero-caption"><span className="tiny-star" aria-hidden="true">✳</span> AI brings the insight. You make the call.</div>
        </div>
        <div className="art-column">
          <CandidateFile person={person} />
          <div className="profile-switcher">
            <span className="profile-label">Meet a sample candidate</span>
            <div className="profiles" role="group" aria-label="Sample candidates">
              {PEOPLE.map((p, i) => (
                <button key={p.name} className="profile-button" type="button" aria-pressed={i === person} onClick={() => onChoose(i)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="wrap hero-bottom">
        <div><span>Résumé screening</span><span className="dot" aria-hidden="true" /><span>AI interviews</span><span className="dot" aria-hidden="true" /><span>Clearer evaluations</span></div>
        <a href="#how" className="down-link">How it works <span aria-hidden="true">↓</span></a>
      </div>
    </>
  );
}
