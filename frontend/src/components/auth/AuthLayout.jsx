import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';

import useStudioPage from '../../hooks/useStudioPage';
import { JOURNEYS, SCREENS } from './authStories';
import { JourneySymbols, JourneyThreads } from './JourneyArt';

/* The sign-in pages' frame, in the Studio design (styles/studio-auth.css): the
 * story and the journey on the left, the form on the right, and the switch
 * between the hiring and the candidate sign-in. `screen` is a key of SCREENS. */
export default function AuthLayout({ screen, children }) {
  const { audience, story, form } = SCREENS[screen];
  const journey = JOURNEYS[audience];
  useStudioPage(`${form.title.replace(/\.$/, '')} — ResuMate`);

  return (
    <div className="studio-auth">
      <a className="skip-link" href="#auth-content">Skip to sign in</a>
      <JourneySymbols />
      <div className="site-wrap">
        <header className="site-header">
          <Link to="/" className="brand" aria-label="ResuMate homepage">
            <span className="brand-mark" aria-hidden="true" />ResuMate<span className="brand-dot">.</span>
          </Link>
          <Link className="back-home" to="/"><span aria-hidden="true">↖</span> Back to the homepage</Link>
        </header>

        <main className="auth-layout">
          <section className="story-column" aria-label="Welcome to ResuMate">
            <p className="eyebrow issue">{story.eyebrow}</p>
            <h1>{story.title[0]}<br /><em>{story.title[1]}</em></h1>
            <p className="story-copy">{story.copy}</p>
            <section className="journey" aria-labelledby="journey-label">
              <div className="journey-heading">
                <h2 id="journey-label">{journey.label}</h2>
                <span aria-hidden="true">A little direction.</span>
              </div>
              <div className="journey-flow">
                <JourneyThreads />
                <ol className="journey-steps" aria-label={journey.name}>
                  {journey.steps.map((step, i) => (
                    <li key={step.title} className="journey-step">
                      <div className="journey-illustration">
                        <svg viewBox="0 0 100 100" aria-hidden="true"><use href={`#journey-${step.icon}`} /></svg>
                      </div>
                      <div className="journey-step-copy">
                        <span className="journey-number" aria-hidden="true">{`0${i + 1} /`}</span>
                        <h3>{step.title}</h3>
                        <p>{step.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
            <p className="art-caption"><span aria-hidden="true">✳</span> {story.caption}</p>
          </section>

          <section className="form-column" aria-label="Account access">
            <div className="form-card">
              <nav className="role-nav" aria-label="Choose account type">
                <Link to="/hiring/login" aria-current={audience === 'hiring' ? 'page' : undefined}>I’m hiring</Link>
                <Link to="/candidate/login" aria-current={audience === 'candidate' ? 'page' : undefined}>I’m a candidate</Link>
              </nav>
              <div id="auth-content" tabIndex={-1}>{children}</div>
              <div className="form-assurance">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v6c0 4 7 8 7 8s7-4 7-8V6l-7-3Z" /><path d="m9 11 2 2 4-4" /></svg>
                <span>Your next chapter starts here.</span>
              </div>
            </div>
          </section>
        </main>

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

/* A form's eyebrow, title and introduction. The title takes the keyboard when
 * the screen changes: when the page was reached from another page in the app,
 * or when `focusKey` changes on the same page (the candidate's two steps). Not
 * when the page is opened directly, where the browser's own start is right. */
export function FormHeading({ screen, intro, focusKey }) {
  const { form } = SCREENS[screen];
  const { key } = useLocation();
  const title = useRef(null);
  const seen = useRef(focusKey);

  useEffect(() => {
    const changed = seen.current !== focusKey;
    seen.current = focusKey;
    if (changed || key !== 'default') title.current?.focus({ preventScroll: true });
  }, [key, focusKey]);

  return (
    <>
      <p className="form-eyebrow">{form.eyebrow}</p>
      <h2 className="form-title" ref={title} tabIndex={-1}>{form.title}</h2>
      <p className="form-intro">{intro ?? form.intro}</p>
    </>
  );
}
