import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import useHeadingFocus from '../../hooks/useHeadingFocus';
import PageFrame from './PageFrame';
import { JOURNEYS, SCREENS } from './authStories';
import { JourneySymbols, JourneyThreads } from './JourneyArt';

/* The sign-in pages' layout, in the Studio design (styles/studio-auth.css): the
 * story and the journey on the left, the form on the right, and the switch
 * between the hiring and the candidate sign-in. `screen` is a key of SCREENS. */
export default function AuthLayout({ screen, children }) {
  const { audience, story, form } = SCREENS[screen];
  const journey = JOURNEYS[audience];

  return (
    <PageFrame
      title={`${form.title.replace(/\.$/, '')} — ResuMate`}
      skipTo="auth-content"
      skipLabel="Skip to sign in"
      defs={<JourneySymbols />}
    >
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
    </PageFrame>
  );
}

/* A form's eyebrow, title and introduction. The title takes the keyboard when
 * the screen changes (hooks/useHeadingFocus.js). `level` 1 makes the title the
 * page's own heading, on a page with no story beside the form. */
export function StepHeading({ eyebrow, title, intro, focusKey, level = 2 }) {
  const heading = useHeadingFocus(focusKey);
  const Title = level === 1 ? 'h1' : 'h2';
  return (
    <>
      <p className="form-eyebrow">{eyebrow}</p>
      <Title className="form-title" ref={heading} tabIndex={-1}>{title}</Title>
      <p className="form-intro">{intro}</p>
    </>
  );
}

/* A sign-in screen's heading, in its words from SCREENS. */
export function FormHeading({ screen, intro, focusKey }) {
  const { form } = SCREENS[screen];
  return <StepHeading eyebrow={form.eyebrow} title={form.title} intro={intro ?? form.intro} focusKey={focusKey} />;
}

/* What replaces a form once it has done its job, such as "Check your inbox.".
 * Its title takes the keyboard, since the form the user was in has gone; the
 * words are announced. The eyebrow is the screen's unless `eyebrow` is given,
 * and `level` 1 makes the title the page's own heading. */
export function SuccessPanel({ screen, eyebrow, title, level = 2, children, action }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const Title = level === 1 ? 'h1' : 'h2';
  return (
    <div className="success-panel">
      <span className="success-mark" aria-hidden="true">✓</span>
      <p className="form-eyebrow">{eyebrow ?? SCREENS[screen].form.eyebrow}</p>
      <Title className="form-title success-title" ref={heading} tabIndex={-1}>{title}</Title>
      <div className="success-copy" role="status">{children}</div>
      {action}
    </div>
  );
}
