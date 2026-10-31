import React from 'react';
import { Link } from 'react-router-dom';

const STEPS = [
  {
    label: '01 / Discover', icon: 'M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h5', title: 'Read between the lines.',
    text: "Bring résumés into one place. Surface relevant experience and skills in the context of the role you're hiring for.",
  },
  {
    label: '02 / Connect', icon: 'M5 4h14v12H9l-5 4V4zM8 8h8M8 12h5', title: 'Go beyond the résumé.',
    text: 'Invite candidates to an AI interview. Add the depth of a conversation to the details on the page.',
  },
  {
    label: '03 / Understand', icon: 'M4 20h16M7 16V9M12 16V4M17 16v-5', title: 'Make a considered call.',
    text: 'Review screening and interview reports together. Use the evidence to guide your next conversation and decision.',
  },
];

/* How it works, in three steps, and the way to the whole page. The hero's
 * "How it works" scrolls here: on a phone, where the menu is hidden, it is the
 * homepage's way to that page. */
export default function Steps() {
  return (
    <section className="story" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <div className="story-head">
          <div><div className="eyebrow">Thoughtfully connected</div><h2 id="how-title">Less busywork.<br /><em>More understanding.</em></h2></div>
          <p>Make room for the work that matters. ResuMate brings your hiring process together, so every next step starts with a clearer picture.</p>
        </div>
        <div className="features">
          {STEPS.map(step => (
            <article key={step.label} className="feature">
              <div className="feature-number">
                <span>{step.label}</span>
                <svg className="feature-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={step.icon} /></svg>
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
        <Link className="secondary story-more" to="/how-it-works">
          See how it works, step by step <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </section>
  );
}
